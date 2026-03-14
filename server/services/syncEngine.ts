/**
 * Sync Engine
 * Orchestrates syncing from ShipHero, Shopify, and Meta Ads into the local database
 */

import { getDb } from "../db";
import {
  products,
  purchaseOrders,
  poLineItems,
  inboundShipments,
  outboundShipments,
  syncLogs,
  velocitySnapshots,
} from "../../drizzle/schema";
import { eq, and, gte } from "drizzle-orm";
import { fetchAllShipHeroProducts, fetchAllShipHeroPurchaseOrders, fetchAllShipHeroInboundShipments, fetchShipHeroShipments } from "./shiphero";
import { fetchAllShopifyOrders28d } from "./shopify";
import { calculateVelocityFromOrders, classifyPerformanceTier, applyOosPenalty, RUNWAY_BY_TIER } from "./forecasting";

async function startSyncLog(syncType: typeof syncLogs.$inferInsert["syncType"]) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(syncLogs).values({ syncType, status: "RUNNING" });
  return (result as any).insertId as number;
}

async function completeSyncLog(id: number, recordsProcessed: number, error?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(syncLogs).set({
    status: error ? "FAILED" : "SUCCESS",
    recordsProcessed,
    errorMessage: error ?? null,
    completedAt: new Date(),
  }).where(eq(syncLogs.id, id));
}

// ─── Sync ShipHero Products ───────────────────────────────────────────────────

export async function syncShipHeroProducts(): Promise<{ synced: number; errors: string[] }> {
  const logId = await startSyncLog("SHIPHERO_PRODUCTS");
  const errors: string[] = [];
  let synced = 0;

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const shProducts = await fetchAllShipHeroProducts();

    for (const sp of shProducts) {
      try {
        const sku = (sp.sku || "").trim();
        if (!sku || /^\d+$/.test(sku)) continue;

        const warehouseProduct = sp.warehouse_products?.[0];
        const onHand = warehouseProduct?.on_hand ?? 0;
        const allocated = warehouseProduct?.allocated ?? 0;
        const available = warehouseProduct?.available ?? 0;

        await db.insert(products).values({
          sku,
          productName: sp.name || sku,
          shipheroProductId: sp.id,
          currentStock: onHand,
          allocatedStock: allocated,
          availableStock: available,
          onHandStock: onHand,
          lastSyncedAt: new Date(),
        }).onDuplicateKeyUpdate({
          set: {
            productName: sp.name || sku,
            shipheroProductId: sp.id,
            currentStock: onHand,
            allocatedStock: allocated,
            availableStock: available,
            onHandStock: onHand,
            lastSyncedAt: new Date(),
          },
        });

        synced++;
      } catch (err: any) {
        errors.push(`SKU ${sp.sku}: ${err.message}`);
      }
    }

    if (logId) await completeSyncLog(logId, synced);
    return { synced, errors };
  } catch (err: any) {
    if (logId) await completeSyncLog(logId, synced, err.message);
    throw err;
  }
}

// ─── Sync Shopify Velocity ────────────────────────────────────────────────────

export async function syncShopifyVelocity(): Promise<{ processed: number; skusUpdated: number }> {
  const logId = await startSyncLog("SHOPIFY_ORDERS");

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const orders = await fetchAllShopifyOrders28d();
    const velocityMap = calculateVelocityFromOrders(orders, 28);

    let skusUpdated = 0;

    for (const [sku, vel] of Array.from(velocityMap.entries())) {
      const existing = await db.select().from(products).where(eq(products.sku, sku)).limit(1);

      if (existing.length === 0) continue;

      const product = existing[0];
      const currentStock = product.currentStock ?? 0;
      const oosDays = product.oosDays ?? 0;

      // Freeze velocity if currently OOS
      let frozenVelocity = product.frozenVelocity ? Number(product.frozenVelocity) : null;
      let newOosDays = oosDays;

      if (currentStock <= 0 && vel.dailyVelocity > 0) {
        // Going OOS — freeze velocity if not already frozen
        if (!frozenVelocity) frozenVelocity = vel.dailyVelocity;
        newOosDays = oosDays + 1;
      } else if (currentStock > 0 && oosDays > 0) {
        // Back in stock — keep frozen velocity for order sizing but reset OOS counter
        newOosDays = 0;
      }

      const { effectiveVelocity, adjustedOrderQty, tier } = applyOosPenalty(vel.dailyVelocity, frozenVelocity, newOosDays);
      const daysOfStockLeft = effectiveVelocity > 0 && currentStock > 0 ? currentStock / effectiveVelocity : currentStock > 0 ? 999 : 0;

      await db.update(products).set({
        dailyVelocity: String(vel.dailyVelocity),
        totalSold28d: vel.totalSold28d,
        frozenVelocity: frozenVelocity !== null ? String(frozenVelocity) : null,
        oosDays: newOosDays,
        performanceTier: tier,
        smartOrderQty: adjustedOrderQty,
        daysOfStockLeft: String(daysOfStockLeft),
      }).where(eq(products.sku, sku));

      // Save daily snapshot
      await db.insert(velocitySnapshots).values({
        sku,
        snapshotDate: new Date(),
        dailyVelocity: String(vel.dailyVelocity),
        unitsSold: vel.totalSold28d,
        stockLevel: currentStock,
        wasOos: currentStock <= 0,
      });

      skusUpdated++;
    }

    if (logId) await completeSyncLog(logId, orders.length);
    return { processed: orders.length, skusUpdated };
  } catch (err: any) {
    if (logId) await completeSyncLog(logId, 0, err.message);
    throw err;
  }
}

// ─── Sync Purchase Orders ─────────────────────────────────────────────────────

export async function syncShipHeroPurchaseOrders(): Promise<{ synced: number }> {
  const logId = await startSyncLog("SHIPHERO_POS");

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const shPOs = await fetchAllShipHeroPurchaseOrders();
    let synced = 0;

    for (const po of shPOs) {
      try {
        const poNumber = po.po_number || po.id;

        // Map ShipHero status
        let status: typeof purchaseOrders.$inferInsert["status"] = "SUBMITTED";
        const shStatus = (po.status || "").toUpperCase();
        if (shStatus.includes("CANCEL")) status = "CANCELLED";
        else if (shStatus.includes("RECEIV") || shStatus.includes("COMPLET")) status = "RECEIVED";
        else if (shStatus.includes("TRANSIT") || shStatus.includes("SHIP")) status = "IN_TRANSIT";
        else if (shStatus.includes("CONFIRM")) status = "CONFIRMED";

        const lineItems = (po.line_items?.edges || []).map((e: any) => e.node);
        const totalUnits = lineItems.reduce((s: number, li: any) => s + (li.quantity || 0), 0);

        await db.insert(purchaseOrders).values({
          poNumber,
          shipheroPoId: po.id,
          vendorName: po.vendor?.name ?? "Unknown",
          vendorId: po.vendor?.id,
          status,
          totalUnits,
          shipheroData: po,
        }).onDuplicateKeyUpdate({
          set: {
            shipheroPoId: po.id,
            vendorName: po.vendor?.name ?? "Unknown",
            status,
            totalUnits,
            shipheroData: po,
          },
        });

        // Upsert line items
        for (const li of lineItems) {
          if (!li.sku) continue;
          // Get PO id
          const poRow = await db.select().from(purchaseOrders).where(eq(purchaseOrders.poNumber, poNumber)).limit(1);
          if (poRow.length === 0) continue;

          await db.insert(poLineItems).values({
            purchaseOrderId: poRow[0].id,
            sku: li.sku,
            productName: li.name,
            quantityOrdered: li.quantity || 0,
            quantityReceived: li.quantity_received || 0,
            unitCost: li.price ? String(li.price) : null,
          }).onDuplicateKeyUpdate({
            set: {
              quantityOrdered: li.quantity || 0,
              quantityReceived: li.quantity_received || 0,
            },
          });
        }

        synced++;
      } catch (err: any) {
        console.error(`[Sync] PO ${po.po_number} error:`, err.message);
      }
    }

    if (logId) await completeSyncLog(logId, synced);
    return { synced };
  } catch (err: any) {
    if (logId) await completeSyncLog(logId, 0, err.message);
    throw err;
  }
}

// ─── Sync Inbound Shipments ───────────────────────────────────────────────────

export async function syncShipHeroInboundShipments(): Promise<{ synced: number }> {
  const logId = await startSyncLog("SHIPHERO_SHIPMENTS");

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const shipments = await fetchAllShipHeroInboundShipments();
    let synced = 0;

    for (const s of shipments) {
      try {
        const lineItems = (s.line_items?.edges || []).map((e: any) => e.node);
        const totalUnits = lineItems.reduce((sum: number, li: any) => sum + (li.quantity || 0), 0);

        let status: typeof inboundShipments.$inferInsert["status"] = "PENDING";
        const shStatus = (s.status || "").toUpperCase();
        if (shStatus.includes("CANCEL")) status = "CANCELLED";
        else if (shStatus.includes("RECEIV") || shStatus.includes("COMPLET")) status = "DELIVERED";
        else if (shStatus.includes("TRANSIT")) status = "IN_TRANSIT";

        await db.insert(inboundShipments).values({
          shipheroShipmentId: s.id,
          poNumber: s.po_number,
          status,
          estimatedArrival: s.expected_date ? new Date(s.expected_date) : null,
          totalUnits,
          destinationWarehouse: s.warehouse_id,
          shipheroData: s,
        }).onDuplicateKeyUpdate({
          set: {
            status,
            estimatedArrival: s.expected_date ? new Date(s.expected_date) : null,
            totalUnits,
            shipheroData: s,
          },
        });

        synced++;
      } catch (err: any) {
        console.error(`[Sync] Inbound shipment error:`, err.message);
      }
    }

    if (logId) await completeSyncLog(logId, synced);
    return { synced };
  } catch (err: any) {
    if (logId) await completeSyncLog(logId, 0, err.message);
    throw err;
  }
}

// ─── Full Sync ────────────────────────────────────────────────────────────────

export async function runFullSync(): Promise<{
  products: number;
  velocity: { processed: number; skusUpdated: number };
  purchaseOrders: number;
  inboundShipments: number;
  errors: string[];
}> {
  const errors: string[] = [];

  const [productResult, velocityResult, poResult, shipmentResult] = await Promise.allSettled([
    syncShipHeroProducts(),
    syncShopifyVelocity(),
    syncShipHeroPurchaseOrders(),
    syncShipHeroInboundShipments(),
  ]);

  const products_synced = productResult.status === "fulfilled" ? productResult.value.synced : 0;
  const velocity = velocityResult.status === "fulfilled" ? velocityResult.value : { processed: 0, skusUpdated: 0 };
  const pos = poResult.status === "fulfilled" ? poResult.value.synced : 0;
  const shipments = shipmentResult.status === "fulfilled" ? shipmentResult.value.synced : 0;

  if (productResult.status === "rejected") errors.push(`Products: ${productResult.reason?.message}`);
  if (velocityResult.status === "rejected") errors.push(`Velocity: ${velocityResult.reason?.message}`);
  if (poResult.status === "rejected") errors.push(`POs: ${poResult.reason?.message}`);
  if (shipmentResult.status === "rejected") errors.push(`Shipments: ${shipmentResult.reason?.message}`);

  return { products: products_synced, velocity, purchaseOrders: pos, inboundShipments: shipments, errors };
}



import { eq, desc, gte, lte, and, or, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  products,
  purchaseOrders,
  poLineItems,
  inboundShipments,
  outboundShipments,
  velocitySnapshots,
  metaSpendCache,
  syncLogs,
  appSettings,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function getAllProducts(search?: string) {
  const db = await getDb();
  if (!db) return [];
  if (search) {
    return db.select().from(products)
      .where(or(like(products.sku, `%${search}%`), like(products.productName, `%${search}%`)))
      .orderBy(products.productName);
  }
  return db.select().from(products).orderBy(products.productName);
}

export async function getProductBySku(sku: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(products).where(eq(products.sku, sku)).limit(1);
  return rows[0] ?? null;
}

export async function getCriticalProducts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products)
    .where(and(eq(products.isActive, true), lte(products.daysOfStockLeft, sql`30`)))
    .orderBy(products.daysOfStockLeft);
}

export async function getStockAlerts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products)
    .where(and(eq(products.isActive, true), lte(products.daysOfStockLeft, sql`120`)))
    .orderBy(products.daysOfStockLeft);
}

// ─── Purchase Orders ──────────────────────────────────────────────────────────

export async function getAllPurchaseOrders() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt));
}

export async function getPurchaseOrderWithItems(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  if (!po) return null;
  const items = await db.select().from(poLineItems).where(eq(poLineItems.purchaseOrderId, id));
  return { ...po, lineItems: items };
}

export async function createPurchaseOrderWithItems(
  po: typeof purchaseOrders.$inferInsert,
  items: typeof poLineItems.$inferInsert[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(purchaseOrders).values(po);
  const poId = (result as any).insertId as number;
  if (items.length > 0) {
    await db.insert(poLineItems).values(items.map((i) => ({ ...i, purchaseOrderId: poId })));
  }
  return poId;
}

// ─── Inbound Shipments ────────────────────────────────────────────────────────

export async function getAllInboundShipments() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inboundShipments).orderBy(desc(inboundShipments.createdAt));
}

// ─── Outbound Shipments ───────────────────────────────────────────────────────

export async function getAllOutboundShipments() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(outboundShipments).orderBy(desc(outboundShipments.createdAt));
}

// ─── Velocity Snapshots ───────────────────────────────────────────────────────

export async function getVelocityHistory(sku: string, days = 90) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db.select().from(velocitySnapshots)
    .where(and(eq(velocitySnapshots.sku, sku), gte(velocitySnapshots.snapshotDate, since)))
    .orderBy(velocitySnapshots.snapshotDate);
}

// ─── Meta Spend ───────────────────────────────────────────────────────────────

export async function getMetaSpendHistory(days = 90) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db.select().from(metaSpendCache)
    .where(gte(metaSpendCache.date, since))
    .orderBy(metaSpendCache.date);
}

export async function upsertMetaSpend(date: Date, spend: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const dateStr = date.toISOString().split("T")[0];
  await db.insert(metaSpendCache).values({
    date,
    spend: String(spend),
    impressions: data.impressions ?? 0,
    linkClicks: data.inline_link_clicks ?? 0,
    purchases: data.purchases ?? 0,
    roas: data.purchase_roas ? String(data.purchase_roas) : null,
    currency: data.currency ?? "AUD",
    rawData: data,
  }).onDuplicateKeyUpdate({
    set: {
      spend: String(spend),
      impressions: data.impressions ?? 0,
      linkClicks: data.inline_link_clicks ?? 0,
      purchases: data.purchases ?? 0,
      rawData: data,
    },
  });
}

// ─── Sync Logs ────────────────────────────────────────────────────────────────

export async function getRecentSyncLogs(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(syncLogs).orderBy(desc(syncLogs.startedAt)).limit(limit);
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(appSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(appSettings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
}

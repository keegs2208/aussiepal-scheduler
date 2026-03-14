import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  getAllProducts,
  getProductBySku,
  getStockAlerts,
  getAllPurchaseOrders,
  getPurchaseOrderWithItems,
  createPurchaseOrderWithItems,
  getAllInboundShipments,
  getAllOutboundShipments,
  getVelocityHistory,
  getMetaSpendHistory,
  getRecentSyncLogs,
  getSetting,
  setSetting,
  getAllSettings,
  getDb,
} from "./db";
import {
  authenticateShipHero,
  isShipHeroConnected,
  createShipHeroPurchaseOrder,
  createShipHeroProduct,
} from "./services/shiphero";
import { isShopifyConnected, createShopifyProduct } from "./services/shopify";
import {
  runFullSync,
  syncShipHeroProducts,
  syncShopifyVelocity,
  syncShipHeroPurchaseOrders,
  syncShipHeroInboundShipments,
} from "./services/syncEngine";
import {
  buildProductForecast,
  calculateMetaSpendCorrelation,
  classifyPriority,
} from "./services/forecasting";
import {
  sendCriticalStockAlert,
  sendWeeklyStockReport,
  sendPOCreatedAlert,
  isSlackConnected,
} from "./services/slack";
import { products, purchaseOrders, stockAlerts } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

// ─── Stock Router ─────────────────────────────────────────────────────────────

const stockRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const prods = await getAllProducts(input?.search);
      return prods.map((p) => buildProductForecast(p));
    }),

  alerts: protectedProcedure.query(async () => {
    const prods = await getStockAlerts();
    return prods
      .map((p) => buildProductForecast(p))
      .filter((f) => f.priority !== "OK")
      .sort((a, b) => {
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, PRE_ORDER: 4, OK: 5 };
        const diff = (order[a.priority] ?? 5) - (order[b.priority] ?? 5);
        if (diff !== 0) return diff;
        return b.dailyVelocity - a.dailyVelocity;
      });
  }),

  summary: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, critical: 0, high: 0, medium: 0, low: 0, oos: 0, preOrder: 0, bestSellers: 0 };

    const allProds = await getAllProducts();
    const forecasts = allProds.map((p) => buildProductForecast(p));

    return {
      total: forecasts.length,
      critical: forecasts.filter((f) => f.priority === "CRITICAL").length,
      high: forecasts.filter((f) => f.priority === "HIGH").length,
      medium: forecasts.filter((f) => f.priority === "MEDIUM").length,
      low: forecasts.filter((f) => f.priority === "LOW").length,
      oos: forecasts.filter((f) => f.currentStock <= 0 && !f.isPreOrder).length,
      preOrder: forecasts.filter((f) => f.isPreOrder).length,
      bestSellers: forecasts.filter((f) => f.performanceTier === "BEST_SELLER").length,
    };
  }),

  getBySku: protectedProcedure
    .input(z.object({ sku: z.string() }))
    .query(async ({ input }) => {
      const p = await getProductBySku(input.sku);
      if (!p) return null;
      return buildProductForecast(p);
    }),

  updateDeliveryDate: protectedProcedure
    .input(z.object({ sku: z.string(), date: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(products).set({
        expectedDeliveryDate: input.date ? new Date(input.date) : null,
      }).where(eq(products.sku, input.sku));
      return { success: true };
    }),
});

// ─── Forecasting Router ───────────────────────────────────────────────────────

const forecastRouter = router({
  velocityHistory: protectedProcedure
    .input(z.object({ sku: z.string(), days: z.number().default(90) }))
    .query(async ({ input }) => {
      return getVelocityHistory(input.sku, input.days);
    }),

  metaSpendHistory: protectedProcedure
    .input(z.object({ days: z.number().default(90) }))
    .query(async ({ input }) => {
      return getMetaSpendHistory(input.days);
    }),

  spendCorrelation: protectedProcedure
    .input(z.object({ sku: z.string(), days: z.number().default(90) }))
    .query(async ({ input }) => {
      return calculateMetaSpendCorrelation(input.sku, input.days);
    }),

  topVelocity: protectedProcedure.query(async () => {
    const prods = await getAllProducts();
    return prods
      .map((p) => buildProductForecast(p))
      .sort((a, b) => b.dailyVelocity - a.dailyVelocity)
      .slice(0, 20);
  }),
});

// ─── Purchase Orders Router ───────────────────────────────────────────────────

const purchaseOrderRouter = router({
  list: protectedProcedure.query(async () => {
    return getAllPurchaseOrders();
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getPurchaseOrderWithItems(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      poNumber: z.string(),
      vendorName: z.string().optional(),
      expectedDeliveryDate: z.string().optional(),
      notes: z.string().optional(),
      currency: z.string().default("AUD"),
      lineItems: z.array(z.object({
        sku: z.string(),
        productName: z.string().optional(),
        colour: z.string().optional(),
        quantityOrdered: z.number(),
        unitCost: z.number().optional(),
      })),
      syncToShipHero: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const totalUnits = input.lineItems.reduce((s, li) => s + li.quantityOrdered, 0);
      const totalCost = input.lineItems.reduce((s, li) => s + (li.unitCost ?? 0) * li.quantityOrdered, 0);

      const poId = await createPurchaseOrderWithItems(
        {
          poNumber: input.poNumber,
          vendorName: input.vendorName,
          expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null,
          notes: input.notes,
          currency: input.currency,
          totalUnits,
          totalCost: totalCost > 0 ? String(totalCost) : null,
          status: "DRAFT",
        },
        input.lineItems.map((li) => ({
          purchaseOrderId: 0, // will be overwritten by createPurchaseOrderWithItems
          sku: li.sku,
          productName: li.productName,
          colour: li.colour,
          quantityOrdered: li.quantityOrdered,
          unitCost: li.unitCost ? String(li.unitCost) : null,
          totalCost: li.unitCost ? String(li.unitCost * li.quantityOrdered) : null,
        }))
      );

      // Optionally sync to ShipHero
      if (input.syncToShipHero) {
        try {
          await createShipHeroPurchaseOrder({
            poNumber: input.poNumber,
            lineItems: input.lineItems.map((li) => ({
              sku: li.sku,
              quantity: li.quantityOrdered,
              price: li.unitCost,
            })),
          });
        } catch (err: any) {
          console.error("[PO] ShipHero sync failed:", err.message);
        }
      }

      // Send Slack notification
      try {
        await sendPOCreatedAlert(
          input.poNumber,
          input.vendorName ?? "Unknown",
          totalUnits,
          input.lineItems.length
        );
      } catch {}

      return { success: true, poId };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["DRAFT", "SUBMITTED", "CONFIRMED", "IN_TRANSIT", "RECEIVED", "CANCELLED", "OVERDUE"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(purchaseOrders).set({ status: input.status }).where(eq(purchaseOrders.id, input.id));
      return { success: true };
    }),
});

// ─── Shipments Router ─────────────────────────────────────────────────────────

const shipmentsRouter = router({
  inbound: protectedProcedure.query(async () => {
    return getAllInboundShipments();
  }),

  outbound: protectedProcedure.query(async () => {
    return getAllOutboundShipments();
  }),
});

// ─── SKU Manager Router ───────────────────────────────────────────────────────

const skuRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return getAllProducts(input?.search);
    }),

  create: protectedProcedure
    .input(z.object({
      sku: z.string(),
      productName: z.string(),
      colour: z.string().optional(),
      price: z.string().optional(),
      vendor: z.string().optional(),
      productType: z.string().optional(),
      barcode: z.string().optional(),
      addToShipHero: z.boolean().default(true),
      addToShopify: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const results: { shiphero?: any; shopify?: any; db: boolean } = { db: false };

      // Add to ShipHero
      if (input.addToShipHero) {
        try {
          const shResult = await createShipHeroProduct({
            sku: input.sku,
            name: input.productName,
            barcode: input.barcode,
            price: input.price ? parseFloat(input.price) : 0,
          });
          results.shiphero = shResult;
        } catch (err: any) {
          console.error("[SKU] ShipHero create failed:", err.message);
        }
      }

      // Add to Shopify
      if (input.addToShopify) {
        try {
          const shopifyResult = await createShopifyProduct({
            title: input.productName,
            sku: input.sku,
            price: input.price ?? "0.00",
            vendor: input.vendor,
            productType: input.productType,
            colour: input.colour,
            barcode: input.barcode,
          });
          results.shopify = shopifyResult;
        } catch (err: any) {
          console.error("[SKU] Shopify create failed:", err.message);
        }
      }

      // Save to local DB
      await db.insert(products).values({
        sku: input.sku,
        productName: input.productName,
        colour: input.colour,
        shopifyProductId: results.shopify?.id ? String(results.shopify.id) : null,
        shopifyVariantId: results.shopify?.variants?.[0]?.id ? String(results.shopify.variants[0].id) : null,
        shipheroProductId: results.shiphero?.product_create?.product?.id ?? null,
        currentStock: 0,
        isActive: true,
      }).onDuplicateKeyUpdate({
        set: {
          productName: input.productName,
          colour: input.colour,
        },
      });

      results.db = true;
      return results;
    }),
});

// ─── Sync Router ─────────────────────────────────────────────────────────────

const syncRouter = router({
  runFull: protectedProcedure.mutation(async () => {
    return runFullSync();
  }),

  syncProducts: protectedProcedure.mutation(async () => {
    return syncShipHeroProducts();
  }),

  syncVelocity: protectedProcedure.mutation(async () => {
    return syncShopifyVelocity();
  }),

  syncPOs: protectedProcedure.mutation(async () => {
    return syncShipHeroPurchaseOrders();
  }),

  syncShipments: protectedProcedure.mutation(async () => {
    return syncShipHeroInboundShipments();
  }),

  logs: protectedProcedure.query(async () => {
    return getRecentSyncLogs(20);
  }),
});

// ─── Settings Router ──────────────────────────────────────────────────────────

const settingsRouter = router({
  getAll: protectedProcedure.query(async () => {
    const all = await getAllSettings();
    // Mask sensitive values and return as array
    const masked: Record<string, string> = {};
    for (const [k, v] of Object.entries(all)) {
      if (k.includes("token") || k.includes("password") || k.includes("secret") || k.includes("webhook")) {
        masked[k] = v ? "••••••••" : "";
      } else {
        masked[k] = v;
      }
    }
    return masked;
  }),

  save: protectedProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input }) => {
      await setSetting(input.key, input.value);
      return { success: true };
    }),

  saveShipHeroCredentials: protectedProcedure
    .input(z.object({ username: z.string(), password: z.string() }))
    .mutation(async ({ input }) => {
      const ok = await authenticateShipHero(input.username, input.password);
      if (!ok) throw new Error("ShipHero authentication failed. Check your credentials.");
      await setSetting("shiphero_username", input.username);
      return { success: true };
    }),

  saveShopifyCredentials: protectedProcedure
    .input(z.object({ storeUrl: z.string(), accessToken: z.string() }))
    .mutation(async ({ input }) => {
      await setSetting("shopify_store_url", input.storeUrl);
      await setSetting("shopify_access_token", input.accessToken);
      return { success: true };
    }),

  saveSlackConfig: protectedProcedure
    .input(z.object({
      webhookUrl: z.string().optional(),
      botToken: z.string().optional(),
      channelId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.webhookUrl) await setSetting("slack_webhook_url", input.webhookUrl);
      if (input.botToken) await setSetting("slack_bot_token", input.botToken);
      if (input.channelId) await setSetting("slack_channel_id", input.channelId);
      return { success: true };
    }),

  connectionStatus: protectedProcedure.query(async () => {
    const [shiphero, shopify, slack] = await Promise.allSettled([
      isShipHeroConnected(),
      isShopifyConnected(),
      isSlackConnected(),
    ]);
    return {
      shiphero: shiphero.status === "fulfilled" ? shiphero.value : false,
      shopify: shopify.status === "fulfilled" ? shopify.value : false,
      slack: slack.status === "fulfilled" ? slack.value : false,
      metaAds: true, // Always connected via MCP
    };
  }),
});

// ─── Alerts Router ────────────────────────────────────────────────────────────

const alertsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(stockAlerts).orderBy(stockAlerts.createdAt).limit(200);
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      await db.update(stockAlerts).set({ isRead: true }).where(eq(stockAlerts.id, input.id));
      return { success: true };
    }),

  markAllRead: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.update(stockAlerts).set({ isRead: true });
    return { success: true };
  }),

  sendSlackDigest: protectedProcedure.mutation(async () => {
    const prods = await getStockAlerts();
    const forecasts = prods.map((p) => buildProductForecast(p));
    const alerts = forecasts
      .filter((f) => f.priority === "CRITICAL" || f.priority === "HIGH")
      .map((f) => ({
        sku: f.sku,
        productName: prods.find((p) => p.sku === f.sku)?.productName ?? f.sku,
        colour: prods.find((p) => p.sku === f.sku)?.colour ?? undefined,
        currentStock: f.currentStock,
        dailyVelocity: f.dailyVelocity,
        daysOfStockLeft: f.daysOfStockLeft,
        priority: f.priority as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
        performanceTier: f.performanceTier,
        recommendedOrder: f.smartOrderQty,
        hasDeliveryDate: f.hasDeliveryDate,
        expectedDeliveryDate: f.expectedDeliveryDate?.toISOString().split("T")[0],
        oosDays: f.oosDays,
        isPreOrder: f.isPreOrder,
      }));
    const sent = await sendCriticalStockAlert(alerts);
    return { success: sent, alertCount: alerts.length };
  }),

  sendDailyAlert: protectedProcedure.mutation(async () => {
    const prods = await getStockAlerts();
    const forecasts = prods.map((p) => buildProductForecast(p));

    const alerts = forecasts
      .filter((f) => f.priority === "CRITICAL" || f.priority === "HIGH")
      .map((f) => ({
        sku: f.sku,
        productName: (prods.find((p) => p.sku === f.sku)?.productName) ?? f.sku,
        colour: prods.find((p) => p.sku === f.sku)?.colour ?? undefined,
        currentStock: f.currentStock,
        dailyVelocity: f.dailyVelocity,
        daysOfStockLeft: f.daysOfStockLeft,
        priority: f.priority as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
        performanceTier: f.performanceTier,
        recommendedOrder: f.smartOrderQty,
        hasDeliveryDate: f.hasDeliveryDate,
        expectedDeliveryDate: f.expectedDeliveryDate?.toISOString().split("T")[0],
        oosDays: f.oosDays,
        isPreOrder: f.isPreOrder,
      }));

    const sent = await sendCriticalStockAlert(alerts);
    return { success: sent, alertCount: alerts.length };
  }),

  sendWeeklyReport: protectedProcedure.mutation(async () => {
    const prods = await getAllProducts();
    const forecasts = prods.map((p) => buildProductForecast(p));

    const alerts = forecasts
      .filter((f) => f.priority !== "OK" && !f.isPreOrder)
      .map((f) => ({
        sku: f.sku,
        productName: prods.find((p) => p.sku === f.sku)?.productName ?? f.sku,
        colour: prods.find((p) => p.sku === f.sku)?.colour ?? undefined,
        currentStock: f.currentStock,
        dailyVelocity: f.dailyVelocity,
        daysOfStockLeft: f.daysOfStockLeft,
        priority: f.priority as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
        performanceTier: f.performanceTier,
        recommendedOrder: f.smartOrderQty,
        hasDeliveryDate: f.hasDeliveryDate,
        expectedDeliveryDate: f.expectedDeliveryDate?.toISOString().split("T")[0],
        oosDays: f.oosDays,
      }));

    const preOrders = forecasts
      .filter((f) => f.isPreOrder)
      .map((f) => ({
        sku: f.sku,
        productName: prods.find((p) => p.sku === f.sku)?.productName ?? f.sku,
        colour: prods.find((p) => p.sku === f.sku)?.colour ?? undefined,
        currentStock: f.currentStock,
        dailyVelocity: f.dailyVelocity,
        daysOfStockLeft: f.daysOfStockLeft,
        priority: "CRITICAL" as const,
        performanceTier: f.performanceTier,
        recommendedOrder: f.smartOrderQty,
        hasDeliveryDate: f.hasDeliveryDate,
        expectedDeliveryDate: f.expectedDeliveryDate?.toISOString().split("T")[0],
        oosDays: f.oosDays,
      }));

    const summary = {
      totalSkus: forecasts.length,
      criticalCount: forecasts.filter((f) => f.priority === "CRITICAL").length,
      highCount: forecasts.filter((f) => f.priority === "HIGH").length,
      oosCount: forecasts.filter((f) => f.currentStock <= 0 && !f.isPreOrder).length,
    };

    const sent = await sendWeeklyStockReport(alerts, preOrders, summary);
    return { success: sent };
  }),
});

// ─── App Router ───────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  stock: stockRouter,
  forecast: forecastRouter,
  purchaseOrders: purchaseOrderRouter,
  shipments: shipmentsRouter,
  sku: skuRouter,
  sync: syncRouter,
  settings: settingsRouter,
  alerts: alertsRouter,
});

export type AppRouter = typeof appRouter;

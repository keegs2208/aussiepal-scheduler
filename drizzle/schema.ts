import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
  bigint,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Products (synced from ShipHero / Shopify) ────────────────────────────────
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  sku: varchar("sku", { length: 128 }).notNull().unique(),
  productName: varchar("productName", { length: 512 }).notNull(),
  colour: varchar("colour", { length: 128 }),
  shopifyProductId: varchar("shopifyProductId", { length: 64 }),
  shopifyVariantId: varchar("shopifyVariantId", { length: 64 }),
  shipheroProductId: varchar("shipheroProductId", { length: 64 }),
  currentStock: int("currentStock").default(0).notNull(),
  allocatedStock: int("allocatedStock").default(0),
  availableStock: int("availableStock").default(0),
  onHandStock: int("onHandStock").default(0),
  isActive: boolean("isActive").default(true).notNull(),
  isPreOrder: boolean("isPreOrder").default(false).notNull(),
  // Forecasting fields
  dailyVelocity: decimal("dailyVelocity", { precision: 10, scale: 4 }).default("0"),
  totalSold28d: int("totalSold28d").default(0),
  oosDays: int("oosDays").default(0),
  frozenVelocity: decimal("frozenVelocity", { precision: 10, scale: 4 }),
  performanceTier: mysqlEnum("performanceTier", ["BEST_SELLER", "STEADY", "SLOW_MOVER"]).default("STEADY"),
  daysOfStockLeft: decimal("daysOfStockLeft", { precision: 10, scale: 1 }),
  smartOrderQty: int("smartOrderQty").default(0),
  // Delivery tracking
  expectedDeliveryDate: timestamp("expectedDeliveryDate"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Velocity Snapshots (daily history for charting) ─────────────────────────
export const velocitySnapshots = mysqlTable("velocity_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  sku: varchar("sku", { length: 128 }).notNull(),
  snapshotDate: timestamp("snapshotDate").notNull(),
  dailyVelocity: decimal("dailyVelocity", { precision: 10, scale: 4 }).default("0"),
  unitsSold: int("unitsSold").default(0),
  stockLevel: int("stockLevel").default(0),
  wasOos: boolean("wasOos").default(false),
  metaSpend: decimal("metaSpend", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VelocitySnapshot = typeof velocitySnapshots.$inferSelect;

// ─── Purchase Orders ──────────────────────────────────────────────────────────
export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  poNumber: varchar("poNumber", { length: 128 }).notNull().unique(),
  shipheroPoId: varchar("shipheroPoId", { length: 128 }),
  vendorName: varchar("vendorName", { length: 256 }),
  vendorId: varchar("vendorId", { length: 128 }),
  status: mysqlEnum("status", ["DRAFT", "SUBMITTED", "CONFIRMED", "IN_TRANSIT", "RECEIVED", "CANCELLED", "OVERDUE"]).default("DRAFT").notNull(),
  expectedDeliveryDate: timestamp("expectedDeliveryDate"),
  actualDeliveryDate: timestamp("actualDeliveryDate"),
  totalUnits: int("totalUnits").default(0),
  totalCost: decimal("totalCost", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 8 }).default("AUD"),
  notes: text("notes"),
  shipheroData: json("shipheroData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;

// ─── PO Line Items ────────────────────────────────────────────────────────────
export const poLineItems = mysqlTable("po_line_items", {
  id: int("id").autoincrement().primaryKey(),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  sku: varchar("sku", { length: 128 }).notNull(),
  productName: varchar("productName", { length: 512 }),
  colour: varchar("colour", { length: 128 }),
  quantityOrdered: int("quantityOrdered").default(0).notNull(),
  quantityReceived: int("quantityReceived").default(0),
  unitCost: decimal("unitCost", { precision: 10, scale: 2 }),
  totalCost: decimal("totalCost", { precision: 12, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PoLineItem = typeof poLineItems.$inferSelect;
export type InsertPoLineItem = typeof poLineItems.$inferInsert;

// ─── Inbound Shipments ────────────────────────────────────────────────────────
export const inboundShipments = mysqlTable("inbound_shipments", {
  id: int("id").autoincrement().primaryKey(),
  shipheroShipmentId: varchar("shipheroShipmentId", { length: 128 }),
  purchaseOrderId: int("purchaseOrderId"),
  poNumber: varchar("poNumber", { length: 128 }),
  vendorName: varchar("vendorName", { length: 256 }),
  status: mysqlEnum("status", ["PENDING", "IN_TRANSIT", "AT_PORT", "CUSTOMS", "DELIVERED", "CANCELLED"]).default("PENDING").notNull(),
  carrier: varchar("carrier", { length: 128 }),
  trackingNumber: varchar("trackingNumber", { length: 256 }),
  trackingUrl: varchar("trackingUrl", { length: 1024 }),
  estimatedArrival: timestamp("estimatedArrival"),
  actualArrival: timestamp("actualArrival"),
  totalUnits: int("totalUnits").default(0),
  originCountry: varchar("originCountry", { length: 64 }),
  destinationWarehouse: varchar("destinationWarehouse", { length: 256 }),
  shipheroData: json("shipheroData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InboundShipment = typeof inboundShipments.$inferSelect;
export type InsertInboundShipment = typeof inboundShipments.$inferInsert;

// ─── Outbound Shipments (customer orders) ────────────────────────────────────
export const outboundShipments = mysqlTable("outbound_shipments", {
  id: int("id").autoincrement().primaryKey(),
  shipheroOrderId: varchar("shipheroOrderId", { length: 128 }),
  shopifyOrderId: varchar("shopifyOrderId", { length: 128 }),
  orderNumber: varchar("orderNumber", { length: 64 }),
  customerName: varchar("customerName", { length: 256 }),
  status: mysqlEnum("status", ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "RETURNED", "CANCELLED"]).default("PENDING").notNull(),
  carrier: varchar("carrier", { length: 128 }),
  trackingNumber: varchar("trackingNumber", { length: 256 }),
  trackingUrl: varchar("trackingUrl", { length: 1024 }),
  shippedAt: timestamp("shippedAt"),
  estimatedDelivery: timestamp("estimatedDelivery"),
  actualDelivery: timestamp("actualDelivery"),
  totalItems: int("totalItems").default(0),
  shipheroData: json("shipheroData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OutboundShipment = typeof outboundShipments.$inferSelect;

// ─── Meta Ads Spend Cache ─────────────────────────────────────────────────────
export const metaSpendCache = mysqlTable("meta_spend_cache", {
  id: int("id").autoincrement().primaryKey(),
  date: timestamp("date").notNull(),
  spend: decimal("spend", { precision: 12, scale: 2 }).default("0"),
  impressions: bigint("impressions", { mode: "number" }).default(0),
  linkClicks: bigint("linkClicks", { mode: "number" }).default(0),
  purchases: int("purchases").default(0),
  roas: decimal("roas", { precision: 8, scale: 4 }),
  currency: varchar("currency", { length: 8 }).default("AUD"),
  rawData: json("rawData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MetaSpendCache = typeof metaSpendCache.$inferSelect;

// ─── Sync Logs ────────────────────────────────────────────────────────────────
export const syncLogs = mysqlTable("sync_logs", {
  id: int("id").autoincrement().primaryKey(),
  syncType: mysqlEnum("syncType", ["SHIPHERO_PRODUCTS", "SHIPHERO_POS", "SHIPHERO_SHIPMENTS", "SHOPIFY_ORDERS", "META_ADS", "FULL"]).notNull(),
  status: mysqlEnum("status", ["RUNNING", "SUCCESS", "FAILED"]).default("RUNNING").notNull(),
  recordsProcessed: int("recordsProcessed").default(0),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type SyncLog = typeof syncLogs.$inferSelect;

// ─── App Settings ─────────────────────────────────────────────────────────────
export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;

// ─── Stock Alerts ─────────────────────────────────────────────────────────────
export const stockAlerts = mysqlTable("stock_alerts", {
  id: int("id").autoincrement().primaryKey(),
  sku: varchar("sku", { length: 128 }),
  alertType: varchar("alertType", { length: 64 }).notNull(),
  severity: mysqlEnum("severity", ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]).notNull().default("INFO"),
  message: text("message").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  slackSent: boolean("slackSent").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StockAlert = typeof stockAlerts.$inferSelect;
export type InsertStockAlert = typeof stockAlerts.$inferInsert;

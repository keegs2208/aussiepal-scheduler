/**
 * Forecasting Engine
 * 28-day rolling velocity, OOS penalty, performance tiers, smart reorder quantities
 * Meta Ads spend correlation for demand prediction
 */

import { getDb } from "../db";
import { products, velocitySnapshots, metaSpendCache } from "../../drizzle/schema";
import { eq, gte, desc, and } from "drizzle-orm";
import type { ShopifyOrder } from "./shopify";

// ─── Constants ────────────────────────────────────────────────────────────────

const LEAD_TIME_DAYS = 120; // CNY supply chain lead time
export const RUNWAY_BY_TIER: Record<string, number> = {
  BEST_SELLER: 150,
  STEADY: 120,
  SLOW_MOVER: 90,
};
const BEST_SELLER_THRESHOLD = 3.0; // units/day
const SLOW_MOVER_THRESHOLD = 0.3; // units/day

// ─── Velocity Calculation ─────────────────────────────────────────────────────

export interface SkuVelocity {
  sku: string;
  totalSold28d: number;
  dailyVelocity: number;
  performanceTier: "BEST_SELLER" | "STEADY" | "SLOW_MOVER";
  smartOrderQty: number;
}

export function calculateVelocityFromOrders(orders: ShopifyOrder[], daysInPeriod = 28): Map<string, SkuVelocity> {
  const skuSales = new Map<string, number>();

  for (const order of orders) {
    for (const li of order.line_items) {
      const sku = (li.sku || "").trim();
      if (!sku || /^\d+$/.test(sku)) continue;
      skuSales.set(sku, (skuSales.get(sku) ?? 0) + li.quantity);
    }
  }

  const result = new Map<string, SkuVelocity>();

  for (const [sku, totalSold] of Array.from(skuSales.entries())) {
    const dailyVelocity = totalSold / daysInPeriod;
    const tier = classifyPerformanceTier(dailyVelocity);
    const runway = RUNWAY_BY_TIER[tier];
    const smartOrderQty = Math.ceil(dailyVelocity * runway);

    result.set(sku, {
      sku,
      totalSold28d: totalSold,
      dailyVelocity,
      performanceTier: tier,
      smartOrderQty,
    });
  }

  return result;
}

export function classifyPerformanceTier(dailyVelocity: number): "BEST_SELLER" | "STEADY" | "SLOW_MOVER" {
  if (dailyVelocity >= BEST_SELLER_THRESHOLD) return "BEST_SELLER";
  if (dailyVelocity <= SLOW_MOVER_THRESHOLD) return "SLOW_MOVER";
  return "STEADY";
}

// ─── OOS Penalty (frozen velocity) ───────────────────────────────────────────

export function applyOosPenalty(
  currentVelocity: number,
  frozenVelocity: number | null,
  oosDays: number
): { effectiveVelocity: number; adjustedOrderQty: number; tier: "BEST_SELLER" | "STEADY" | "SLOW_MOVER" } {
  // If item has been OOS, use the frozen velocity (pre-OOS velocity) for forecasting
  const effectiveVelocity = frozenVelocity !== null && oosDays > 0 ? frozenVelocity : currentVelocity;
  const tier = classifyPerformanceTier(effectiveVelocity);
  const runway = RUNWAY_BY_TIER[tier];
  const adjustedOrderQty = Math.ceil(effectiveVelocity * runway);

  return { effectiveVelocity, adjustedOrderQty, tier };
}

// ─── Priority Classification ──────────────────────────────────────────────────

export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "OK" | "PRE_ORDER";

export function classifyPriority(daysOfStockLeft: number, currentStock: number): Priority {
  if (currentStock < 0) return "PRE_ORDER";
  if (currentStock === 0) return "CRITICAL";
  if (daysOfStockLeft <= 30) return "CRITICAL";
  if (daysOfStockLeft <= 60) return "HIGH";
  if (daysOfStockLeft <= 90) return "MEDIUM";
  if (daysOfStockLeft <= LEAD_TIME_DAYS) return "LOW";
  return "OK";
}

// ─── Meta Ads Spend Correlation ───────────────────────────────────────────────

export interface SpendCorrelation {
  correlationCoefficient: number;
  avgSpendPerUnit: number;
  highSpendMultiplier: number;
  recommendation: string;
}

export async function calculateMetaSpendCorrelation(sku: string, lookbackDays = 90): Promise<SpendCorrelation> {
  const db = await getDb();
  if (!db) return { correlationCoefficient: 0, avgSpendPerUnit: 0, highSpendMultiplier: 1, recommendation: "No data available" };

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const [snapshots, spendData] = await Promise.all([
    db.select().from(velocitySnapshots)
      .where(and(eq(velocitySnapshots.sku, sku), gte(velocitySnapshots.snapshotDate, since)))
      .orderBy(velocitySnapshots.snapshotDate),
    db.select().from(metaSpendCache)
      .where(gte(metaSpendCache.date, since))
      .orderBy(metaSpendCache.date),
  ]);

  if (snapshots.length < 7 || spendData.length < 7) {
    return { correlationCoefficient: 0, avgSpendPerUnit: 0, highSpendMultiplier: 1, recommendation: "Insufficient data for correlation analysis" };
  }

  // Build daily spend map
  const spendByDate = new Map<string, number>();
  for (const s of spendData) {
    const dateKey = new Date(s.date).toISOString().split("T")[0];
    spendByDate.set(dateKey, Number(s.spend));
  }

  // Align velocity with spend
  const pairs: Array<{ velocity: number; spend: number }> = [];
  for (const snap of snapshots) {
    const dateKey = new Date(snap.snapshotDate).toISOString().split("T")[0];
    const spend = spendByDate.get(dateKey);
    if (spend !== undefined && snap.unitsSold !== null) {
      pairs.push({ velocity: snap.unitsSold, spend });
    }
  }

  if (pairs.length < 5) {
    return { correlationCoefficient: 0, avgSpendPerUnit: 0, highSpendMultiplier: 1, recommendation: "Not enough overlapping data" };
  }

  // Pearson correlation
  const n = pairs.length;
  const sumX = pairs.reduce((s, p) => s + p.spend, 0);
  const sumY = pairs.reduce((s, p) => s + p.velocity, 0);
  const sumXY = pairs.reduce((s, p) => s + p.spend * p.velocity, 0);
  const sumX2 = pairs.reduce((s, p) => s + p.spend * p.spend, 0);
  const sumY2 = pairs.reduce((s, p) => s + p.velocity * p.velocity, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  const r = denominator === 0 ? 0 : numerator / denominator;

  const avgSpend = sumX / n;
  const avgUnits = sumY / n;
  const avgSpendPerUnit = avgUnits > 0 ? avgSpend / avgUnits : 0;

  // High spend multiplier: when spend is 2x average, how much does velocity increase?
  const highSpendPairs = pairs.filter((p) => p.spend > avgSpend * 1.5);
  const avgHighVelocity = highSpendPairs.length > 0
    ? highSpendPairs.reduce((s, p) => s + p.velocity, 0) / highSpendPairs.length
    : avgUnits;
  const highSpendMultiplier = avgUnits > 0 ? avgHighVelocity / avgUnits : 1;

  let recommendation = "";
  if (r > 0.7) {
    recommendation = `Strong positive correlation (r=${r.toFixed(2)}). High ad spend significantly boosts velocity. Consider increasing order quantities during high-spend periods.`;
  } else if (r > 0.4) {
    recommendation = `Moderate correlation (r=${r.toFixed(2)}). Ad spend has some influence on velocity. Monitor during campaign periods.`;
  } else if (r > 0) {
    recommendation = `Weak positive correlation (r=${r.toFixed(2)}). Ad spend has minimal direct impact on velocity for this SKU.`;
  } else {
    recommendation = `No significant correlation (r=${r.toFixed(2)}). Velocity appears independent of ad spend for this SKU.`;
  }

  return { correlationCoefficient: r, avgSpendPerUnit, highSpendMultiplier, recommendation };
}

// ─── Full Forecast for a Product ─────────────────────────────────────────────

export interface ProductForecast {
  sku: string;
  currentStock: number;
  dailyVelocity: number;
  effectiveVelocity: number;
  daysOfStockLeft: number;
  priority: Priority;
  performanceTier: "BEST_SELLER" | "STEADY" | "SLOW_MOVER";
  smartOrderQty: number;
  oosDays: number;
  frozenVelocity: number | null;
  hasDeliveryDate: boolean;
  expectedDeliveryDate: Date | null;
  isPreOrder: boolean;
  totalSold28d: number;
}

export function buildProductForecast(product: {
  sku: string;
  currentStock: number;
  dailyVelocity: string | number | null;
  frozenVelocity: string | number | null;
  oosDays: number | null;
  performanceTier: string | null;
  smartOrderQty: number | null;
  expectedDeliveryDate: Date | null;
  isPreOrder: boolean;
  totalSold28d: number | null;
}): ProductForecast {
  const velocity = Number(product.dailyVelocity ?? 0);
  const frozen = product.frozenVelocity !== null ? Number(product.frozenVelocity) : null;
  const oosDays = product.oosDays ?? 0;

  const { effectiveVelocity, adjustedOrderQty, tier } = applyOosPenalty(velocity, frozen, oosDays);

  const daysOfStockLeft = effectiveVelocity > 0 && product.currentStock > 0
    ? product.currentStock / effectiveVelocity
    : product.currentStock > 0
    ? 999
    : 0;

  const priority = classifyPriority(daysOfStockLeft, product.currentStock);

  return {
    sku: product.sku,
    currentStock: product.currentStock,
    dailyVelocity: velocity,
    effectiveVelocity,
    daysOfStockLeft,
    priority,
    performanceTier: tier,
    smartOrderQty: product.smartOrderQty ?? adjustedOrderQty,
    oosDays,
    frozenVelocity: frozen,
    hasDeliveryDate: !!product.expectedDeliveryDate,
    expectedDeliveryDate: product.expectedDeliveryDate,
    isPreOrder: product.isPreOrder,
    totalSold28d: product.totalSold28d ?? 0,
  };
}

/**
 * Slack Notification Service
 * Sends stock alerts, weekly reports, and PO notifications to Slack
 */

import axios from "axios";
import { getDb } from "../db";
import { appSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function getSlackConfig(): Promise<{ webhookUrl?: string; botToken?: string; channelId?: string } | null> {
  const webhookUrl = await getSetting("slack_webhook_url");
  const botToken = await getSetting("slack_bot_token");
  const channelId = await getSetting("slack_channel_id");
  if (!webhookUrl && !botToken) return null;
  return { webhookUrl: webhookUrl ?? undefined, botToken: botToken ?? undefined, channelId: channelId ?? undefined };
}

export async function sendSlackMessage(text: string, blocks?: any[]): Promise<boolean> {
  const config = await getSlackConfig();
  if (!config) {
    console.warn("[Slack] Not configured. Skipping notification.");
    return false;
  }

  try {
    if (config.webhookUrl) {
      const payload: any = { text };
      if (blocks) payload.blocks = blocks;
      await axios.post(config.webhookUrl, payload);
      return true;
    }

    if (config.botToken && config.channelId) {
      const payload: any = { channel: config.channelId, text };
      if (blocks) payload.blocks = blocks;
      await axios.post("https://slack.com/api/chat.postMessage", payload, {
        headers: { Authorization: `Bearer ${config.botToken}` },
      });
      return true;
    }

    return false;
  } catch (err: any) {
    console.error("[Slack] Failed to send message:", err?.response?.data || err.message);
    return false;
  }
}

// ─── Alert Formatters ─────────────────────────────────────────────────────────

export interface StockAlert {
  sku: string;
  productName: string;
  colour?: string;
  currentStock: number;
  dailyVelocity: number;
  daysOfStockLeft: number;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  performanceTier: string;
  recommendedOrder: number;
  hasDeliveryDate: boolean;
  expectedDeliveryDate?: string;
  oosDays: number;
  isPreOrder?: boolean;
}

export async function sendCriticalStockAlert(alerts: StockAlert[]): Promise<boolean> {
  if (alerts.length === 0) return true;

  const critical = alerts.filter((a) => a.priority === "CRITICAL");
  const high = alerts.filter((a) => a.priority === "HIGH");

  let text = `⚡ *DAILY STOCK ALERT — The Aussie Pal*\n`;
  text += `🚨 *${critical.length} CRITICAL + ${high.length} HIGH priority items*\n`;
  text += `_120-day CNY lead time | Ordered by performance tier_\n\n`;

  const priorityEmoji: Record<string, string> = {
    CRITICAL: "🔴",
    HIGH: "🟠",
    MEDIUM: "🟡",
    LOW: "🟢",
  };
  const tierEmoji: Record<string, string> = {
    BEST_SELLER: " 🔥",
    SLOW_MOVER: " 🐢",
    STEADY: "",
  };

  for (const alert of alerts.slice(0, 20)) {
    const emoji = priorityEmoji[alert.priority] ?? "⚪";
    const tier = tierEmoji[alert.performanceTier] ?? "";
    const oosTag = alert.oosDays > 0 ? ` ❄️ OOS ${alert.oosDays}d` : "";
    const deliveryTag = alert.hasDeliveryDate
      ? ` → ETA: ${alert.expectedDeliveryDate}`
      : alert.daysOfStockLeft <= 30
      ? " ⚠️ NO ETA"
      : "";

    text += `${emoji} *${alert.productName}${alert.colour ? " - " + alert.colour : ""}* (${alert.sku})${tier}${oosTag}${deliveryTag}\n`;
    text += `   Stock: ${alert.currentStock} | ${Number(alert.dailyVelocity).toFixed(1)}/day | ${Math.round(alert.daysOfStockLeft)}d left | Order ${alert.recommendedOrder}\n\n`;
  }

  if (alerts.length > 20) {
    text += `_... +${alerts.length - 20} more items_\n`;
  }

  return sendSlackMessage(text);
}

export async function sendWeeklyStockReport(
  alerts: StockAlert[],
  preOrders: StockAlert[],
  summary: { totalSkus: number; criticalCount: number; highCount: number; oosCount: number }
): Promise<boolean> {
  let text = `📊 *WEEKLY STOCK REPORT — The Aussie Pal*\n\n`;
  text += `📦 *Summary:*\n`;
  text += `• Total active SKUs: ${summary.totalSkus}\n`;
  text += `• 🔴 Critical (≤30d): ${summary.criticalCount}\n`;
  text += `• 🟠 High (≤60d): ${summary.highCount}\n`;
  text += `• ❌ Currently OOS: ${summary.oosCount}\n\n`;

  if (alerts.length > 0) {
    text += `📦 *RESTOCK NEEDED (${alerts.length}):*\n\n`;
    for (const alert of alerts.slice(0, 15)) {
      const emoji = { CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "🟢" }[alert.priority] ?? "⚪";
      text += `${emoji} *${alert.productName}${alert.colour ? " - " + alert.colour : ""}* — ${Math.round(alert.daysOfStockLeft)}d left | Order ${alert.recommendedOrder}\n`;
    }
    if (alerts.length > 15) text += `_... +${alerts.length - 15} more_\n`;
  }

  if (preOrders.length > 0) {
    text += `\n⏳ *PRE-ORDERS (${preOrders.length}):*\n`;
    for (const po of preOrders.slice(0, 10)) {
      const backorder = Math.abs(po.currentStock);
      text += `• *${po.productName}${po.colour ? " - " + po.colour : ""}* — ${backorder} backorder | ${Number(po.dailyVelocity).toFixed(1)}/day\n`;
    }
  }

  text += `\n_📅 Next report: Monday_`;
  return sendSlackMessage(text);
}

export async function sendPOCreatedAlert(poNumber: string, vendorName: string, totalUnits: number, skuCount: number): Promise<boolean> {
  const text = `📋 *New Purchase Order Created*\n• PO: *${poNumber}*\n• Vendor: ${vendorName}\n• SKUs: ${skuCount} | Units: ${totalUnits}`;
  return sendSlackMessage(text);
}

export async function sendOverdueDeliveryAlert(overdueItems: Array<{ poNumber: string; sku: string; productName: string; expectedDate: string }>): Promise<boolean> {
  if (overdueItems.length === 0) return true;
  let text = `⚠️ *OVERDUE DELIVERIES — Action Required*\n\n`;
  for (const item of overdueItems) {
    text += `• *${item.productName}* (${item.sku}) — PO ${item.poNumber} was due ${item.expectedDate}\n`;
  }
  return sendSlackMessage(text);
}

export async function isSlackConnected(): Promise<boolean> {
  const config = await getSlackConfig();
  return !!config;
}

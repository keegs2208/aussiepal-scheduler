/**
 * Shopify Admin API Service
 * Handles product, variant, and order data from Shopify
 */

import axios from "axios";
import { getDb } from "../db";
import { appSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const SHOPIFY_API_VERSION = "2024-01";

async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function getShopifyConfig(): Promise<{ storeUrl: string; accessToken: string } | null> {
  const storeUrl = await getSetting("shopify_store_url");
  const accessToken = await getSetting("shopify_access_token");
  if (!storeUrl || !accessToken) return null;
  return { storeUrl, accessToken };
}

function shopifyClient(storeUrl: string, accessToken: string) {
  return axios.create({
    baseURL: `https://${storeUrl}/admin/api/${SHOPIFY_API_VERSION}`,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    timeout: 30000,
  });
}

// ─── Orders (for velocity calculation) ───────────────────────────────────────

export interface ShopifyOrderLine {
  sku: string;
  quantity: number;
  variant_id: number;
  product_id: number;
  name: string;
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  line_items: ShopifyOrderLine[];
}

export async function fetchShopifyOrders(
  createdAtMin: string,
  createdAtMax?: string,
  pageInfo?: string
): Promise<{ orders: ShopifyOrder[]; nextPageInfo?: string }> {
  const config = await getShopifyConfig();
  if (!config) throw new Error("Shopify not configured. Please add credentials in Settings.");

  const client = shopifyClient(config.storeUrl, config.accessToken);

  const params: Record<string, string> = {
    limit: "250",
    fields: "id,order_number,created_at,financial_status,fulfillment_status,line_items",
    status: "any",
  };

  if (pageInfo) {
    params.page_info = pageInfo;
  } else {
    params.created_at_min = createdAtMin;
    if (createdAtMax) params.created_at_max = createdAtMax;
  }

  const res = await client.get("/orders.json", { params });
  const orders: ShopifyOrder[] = res.data.orders || [];

  // Extract next page cursor from Link header
  const linkHeader = res.headers.link as string | undefined;
  let nextPageInfo: string | undefined;
  if (linkHeader) {
    const match = linkHeader.match(/<[^>]+page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    if (match) nextPageInfo = match[1];
  }

  return { orders, nextPageInfo };
}

export async function fetchAllShopifyOrders28d(): Promise<ShopifyOrder[]> {
  const createdAtMin = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
  const allOrders: ShopifyOrder[] = [];
  let pageInfo: string | undefined;

  do {
    const result = await fetchShopifyOrders(createdAtMin, undefined, pageInfo);
    allOrders.push(...result.orders);
    pageInfo = result.nextPageInfo;
  } while (pageInfo);

  return allOrders;
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function fetchShopifyProducts(pageInfo?: string) {
  const config = await getShopifyConfig();
  if (!config) throw new Error("Shopify not configured.");

  const client = shopifyClient(config.storeUrl, config.accessToken);
  const params: Record<string, string> = { limit: "250" };
  if (pageInfo) params.page_info = pageInfo;

  const res = await client.get("/products.json", { params });
  const products = res.data.products || [];

  const linkHeader = res.headers.link as string | undefined;
  let nextPageInfo: string | undefined;
  if (linkHeader) {
    const match = linkHeader.match(/<[^>]+page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    if (match) nextPageInfo = match[1];
  }

  return { products, nextPageInfo };
}

export async function fetchAllShopifyProducts() {
  const allProducts: any[] = [];
  let pageInfo: string | undefined;

  do {
    const result = await fetchShopifyProducts(pageInfo);
    allProducts.push(...result.products);
    pageInfo = result.nextPageInfo;
  } while (pageInfo);

  return allProducts;
}

// ─── Create Product ───────────────────────────────────────────────────────────

export async function createShopifyProduct(input: {
  title: string;
  sku: string;
  price: string;
  compareAtPrice?: string;
  vendor?: string;
  productType?: string;
  tags?: string;
  colour?: string;
  barcode?: string;
}) {
  const config = await getShopifyConfig();
  if (!config) throw new Error("Shopify not configured.");

  const client = shopifyClient(config.storeUrl, config.accessToken);

  const options = input.colour ? [{ name: "Color", values: [input.colour] }] : [];
  const variant: any = {
    sku: input.sku,
    price: input.price,
    inventory_management: "shopify",
    inventory_policy: "deny",
  };
  if (input.compareAtPrice) variant.compare_at_price = input.compareAtPrice;
  if (input.colour) variant.option1 = input.colour;
  if (input.barcode) variant.barcode = input.barcode;

  const product: any = {
    title: input.title,
    vendor: input.vendor,
    product_type: input.productType,
    tags: input.tags,
    variants: [variant],
  };
  if (options.length > 0) product.options = options;

  const res = await client.post("/products.json", { product });
  return res.data.product;
}

// ─── Update Inventory ─────────────────────────────────────────────────────────

export async function setShopifyInventory(inventoryItemId: number, locationId: number, quantity: number) {
  const config = await getShopifyConfig();
  if (!config) throw new Error("Shopify not configured.");

  const client = shopifyClient(config.storeUrl, config.accessToken);
  const res = await client.post("/inventory_levels/set.json", {
    inventory_item_id: inventoryItemId,
    location_id: locationId,
    available: quantity,
  });
  return res.data;
}

export async function isShopifyConnected(): Promise<boolean> {
  const config = await getShopifyConfig();
  if (!config) return false;
  try {
    const client = shopifyClient(config.storeUrl, config.accessToken);
    await client.get("/shop.json");
    return true;
  } catch {
    return false;
  }
}

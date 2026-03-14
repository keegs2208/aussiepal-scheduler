/**
 * ShipHero GraphQL API Service
 * Handles authentication, token refresh, and all ShipHero queries/mutations
 */

import axios from "axios";
import { getDb } from "../db";
import { appSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const SHIPHERO_AUTH_URL = "https://public-api.shiphero.com/auth/token";
const SHIPHERO_REFRESH_URL = "https://public-api.shiphero.com/auth/refresh";
const SHIPHERO_GRAPHQL_URL = "https://public-api.shiphero.com/graphql/";

interface ShipHeroTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix ms
}

// ─── Token Management ─────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(appSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
}

async function getTokens(): Promise<ShipHeroTokens | null> {
  const raw = await getSetting("shiphero_tokens");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ShipHeroTokens;
  } catch {
    return null;
  }
}

async function saveTokens(tokens: ShipHeroTokens): Promise<void> {
  await setSetting("shiphero_tokens", JSON.stringify(tokens));
}

export async function authenticateShipHero(username: string, password: string): Promise<boolean> {
  try {
    const res = await axios.post(SHIPHERO_AUTH_URL, { username, password });
    const data = res.data;
    const tokens: ShipHeroTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000) - 60000, // 1 min buffer
    };
    await saveTokens(tokens);
    return true;
  } catch (err: any) {
    console.error("[ShipHero] Auth failed:", err?.response?.data || err.message);
    return false;
  }
}

async function refreshTokens(refreshToken: string): Promise<ShipHeroTokens | null> {
  try {
    const res = await axios.post(SHIPHERO_REFRESH_URL, { refresh_token: refreshToken });
    const data = res.data;
    const tokens: ShipHeroTokens = {
      access_token: data.access_token,
      refresh_token: refreshToken, // refresh token stays the same
      expires_at: Date.now() + (data.expires_in * 1000) - 60000,
    };
    await saveTokens(tokens);
    return tokens;
  } catch (err: any) {
    console.error("[ShipHero] Token refresh failed:", err?.response?.data || err.message);
    return null;
  }
}

async function getValidToken(): Promise<string | null> {
  let tokens = await getTokens();
  if (!tokens) return null;

  if (Date.now() >= tokens.expires_at) {
    tokens = await refreshTokens(tokens.refresh_token);
  }
  return tokens?.access_token ?? null;
}

// ─── GraphQL Client ───────────────────────────────────────────────────────────

async function graphql<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
  const token = await getValidToken();
  if (!token) throw new Error("ShipHero not authenticated. Please configure credentials in Settings.");

  const res = await axios.post(
    SHIPHERO_GRAPHQL_URL,
    { query, variables },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );

  if (res.data.errors) {
    const msg = res.data.errors.map((e: any) => e.message).join(", ");
    throw new Error(`ShipHero GraphQL error: ${msg}`);
  }

  return res.data.data as T;
}

// ─── Products / Inventory ─────────────────────────────────────────────────────

export async function fetchShipHeroProducts(cursor?: string) {
  const query = `
    query GetProducts($cursor: String) {
      products(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            sku
            name
            barcode
            warehouse_products {
              warehouse_id
              on_hand
              allocated
              available
              backorder
            }
          }
        }
      }
    }
  `;
  return graphql(query, { cursor });
}

export async function fetchAllShipHeroProducts() {
  const allProducts: any[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const data = await fetchShipHeroProducts(cursor);
    const products = data?.products;
    if (!products) break;

    for (const edge of products.edges || []) {
      allProducts.push(edge.node);
    }

    hasMore = products.pageInfo?.hasNextPage ?? false;
    cursor = products.pageInfo?.endCursor;
  }

  return allProducts;
}

// ─── Purchase Orders ──────────────────────────────────────────────────────────

export async function fetchShipHeroPurchaseOrders(cursor?: string) {
  const query = `
    query GetPurchaseOrders($cursor: String) {
      purchase_orders(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            po_number
            vendor { id name }
            status
            created_date
            fulfillment_status
            line_items {
              edges {
                node {
                  id
                  sku
                  name
                  quantity
                  quantity_received
                  price
                  expected_weight_in_lbs
                }
              }
            }
          }
        }
      }
    }
  `;
  return graphql(query, { cursor });
}

export async function fetchAllShipHeroPurchaseOrders() {
  const allPOs: any[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const data = await fetchShipHeroPurchaseOrders(cursor);
    const pos = data?.purchase_orders;
    if (!pos) break;

    for (const edge of pos.edges || []) {
      allPOs.push(edge.node);
    }

    hasMore = pos.pageInfo?.hasNextPage ?? false;
    cursor = pos.pageInfo?.endCursor;
  }

  return allPOs;
}

export async function createShipHeroPurchaseOrder(input: {
  poNumber: string;
  vendorId?: string;
  lineItems: Array<{ sku: string; quantity: number; price?: number }>;
}) {
  const mutation = `
    mutation CreatePO($input: PurchaseOrderInput!) {
      purchase_order_create(data: $input) {
        request_id
        complexity
        purchase_order {
          id
          po_number
          status
        }
      }
    }
  `;
  return graphql(mutation, {
    input: {
      po_number: input.poNumber,
      vendor_id: input.vendorId,
      line_items: input.lineItems.map((li) => ({
        sku: li.sku,
        quantity: li.quantity,
        price: li.price ?? 0,
      })),
    },
  });
}

// ─── Inbound Shipments ────────────────────────────────────────────────────────

export async function fetchShipHeroInboundShipments(cursor?: string) {
  const query = `
    query GetInboundShipments($cursor: String) {
      inbound_shipments(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            po_number
            status
            created_date
            expected_date
            warehouse_id
            line_items {
              edges {
                node {
                  id
                  sku
                  name
                  quantity
                  quantity_received
                }
              }
            }
          }
        }
      }
    }
  `;
  return graphql(query, { cursor });
}

export async function fetchAllShipHeroInboundShipments() {
  const all: any[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const data = await fetchShipHeroInboundShipments(cursor);
    const shipments = data?.inbound_shipments;
    if (!shipments) break;

    for (const edge of shipments.edges || []) {
      all.push(edge.node);
    }

    hasMore = shipments.pageInfo?.hasNextPage ?? false;
    cursor = shipments.pageInfo?.endCursor;
  }

  return all;
}

// ─── Outbound Shipments ───────────────────────────────────────────────────────

export async function fetchShipHeroShipments(cursor?: string, fromDate?: string) {
  const query = `
    query GetShipments($cursor: String, $fromDate: ISODateTime) {
      shipments(first: 100, after: $cursor, created_from: $fromDate) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            order_number
            status
            tracking_number
            carrier
            created_date
            shipped_date
            ready_to_ship
            profile
            line_items {
              edges {
                node {
                  id
                  sku
                  name
                  quantity
                }
              }
            }
          }
        }
      }
    }
  `;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return graphql(query, { cursor, fromDate: fromDate ?? thirtyDaysAgo });
}

// ─── Product Create/Update ────────────────────────────────────────────────────

export async function createShipHeroProduct(input: {
  sku: string;
  name: string;
  barcode?: string;
  price?: number;
  value?: number;
  warehouseId?: string;
}) {
  const mutation = `
    mutation CreateProduct($input: ProductInput!) {
      product_create(data: $input) {
        request_id
        complexity
        product {
          id
          sku
          name
        }
      }
    }
  `;
  return graphql(mutation, {
    input: {
      sku: input.sku,
      name: input.name,
      barcode: input.barcode,
      price: input.price ?? 0,
      value: input.value ?? 0,
    },
  });
}

export async function isShipHeroConnected(): Promise<boolean> {
  const token = await getValidToken();
  return !!token;
}

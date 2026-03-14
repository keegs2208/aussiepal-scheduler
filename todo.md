# Aussie Pal Stock Intelligence — TODO

## Backend
- [x] Database schema: products, velocity_snapshots, purchase_orders, po_line_items, inbound_shipments, outbound_shipments, sync_logs, meta_spend_cache, app_settings, stock_alerts
- [x] ShipHero API service (GraphQL client, auth, token refresh)
- [x] Shopify API service (orders, products, inventory)
- [x] Meta Ads API service (spend data via Meta MCP)
- [x] Slack notification service (critical alerts, weekly reports, PO created)
- [x] Sync engine: ShipHero products + inventory sync
- [x] Sync engine: Shopify orders velocity calculation
- [x] Forecasting engine: 28d rolling velocity, OOS penalty, performance tiers
- [x] Smart reorder calculator (tier-based runway + lead time)
- [x] tRPC routers: stock, forecast, purchaseOrders, shipments, sku, alerts, sync, settings

## Frontend
- [x] Design tokens: dark elegant theme (deep navy/charcoal, gold accents)
- [x] DashboardLayout with sidebar navigation
- [x] Stock Dashboard page (live levels, velocity, days left, tiers, priority alerts)
- [x] Forecasting page (velocity chart, OOS history, Meta Ads spend correlation)
- [x] Purchase Orders page (view POs, create PO, overdue flags, ShipHero sync)
- [x] Ship Tracker page (inbound + outbound shipments with carrier tracking)
- [x] SKU Manager page (add/edit SKUs, sync to ShipHero + Shopify)
- [x] Alerts page (priority-coded stock alerts, mark read, Slack digest)
- [x] Settings page (API credentials, Slack config, sync logs)

## Integrations
- [x] ShipHero credentials (token stored in app_settings)
- [x] Shopify API token (store URL + token in app_settings)
- [x] Slack webhook (webhook URL + channel in app_settings)
- [x] Meta Ads via MCP (act_640068150234495 connected)

## Tests
- [x] Forecasting engine unit tests (25 tests: velocity, OOS, priority, tier, smart order)
- [x] Auth logout test (1 test)
- [ ] ShipHero API service integration tests (requires live credentials)
- [ ] Shopify API service integration tests (requires live credentials)

## Future Enhancements
- [ ] Scheduled daily/weekly Slack alerts (cron job)
- [ ] Meta Ads spend chart overlay on forecasting page
- [ ] Bulk SKU import from CSV
- [ ] Carrier API integration for real-time tracking (Australia Post, DHL, FedEx)
- [ ] CNY lead time calendar with blackout dates

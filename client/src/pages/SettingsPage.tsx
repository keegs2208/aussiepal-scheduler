import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Save, RefreshCw, CheckCircle2, XCircle, Zap } from "lucide-react";
import { ConnectionStatus } from "@/components/StockBadges";
import { toast } from "sonner";
import { useState, useEffect } from "react";

export default function SettingsPage() {
  const { data: settings, refetch } = trpc.settings.getAll.useQuery();
  const { data: syncLogs } = trpc.sync.logs.useQuery();
  const utils = trpc.useUtils();
  const saveOneSetting = trpc.settings.save.useMutation({
    onError: (e: any) => toast.error(`Save failed: ${e.message}`),
  });
  const runSync = trpc.sync.runFull.useMutation({
    onSuccess: (d) => toast.success(`Sync complete — ${d.products} products synced`),
    onError: (e: any) => toast.error(`Sync failed: ${e.message}`),
  });

  const [form, setForm] = useState({
    shiphero_token: "",
    shopify_store: "",
    shopify_token: "",
    slack_webhook: "",
    slack_channel: "",
    meta_account_id: "",
  });

  useEffect(() => {
    if (settings) {
      const map = settings as unknown as Record<string, string>;
      setForm((prev) => ({
        ...prev,
        shiphero_token: map.shiphero_token ?? prev.shiphero_token,
        shopify_store: map.shopify_store ?? prev.shopify_store,
        shopify_token: map.shopify_token ?? prev.shopify_token,
        slack_webhook: map.slack_webhook ?? prev.slack_webhook,
        slack_channel: map.slack_channel ?? prev.slack_channel,
        meta_account_id: map.meta_account_id ?? prev.meta_account_id,
      }));
    }
  }, [settings]);

  async function handleSave() {
    const entries = Object.entries(form);
    for (const [key, value] of entries) {
      await saveOneSetting.mutateAsync({ key, value });
    }
    toast.success("Settings saved");
    refetch();
  }

  const shipheroConnected = !!(form.shiphero_token && form.shiphero_token.length > 10);
  const shopifyConnected = !!(form.shopify_store && form.shopify_token);
  const slackConnected = !!(form.slack_webhook && form.slack_webhook.startsWith("https://hooks.slack.com"));
  const metaConnected = !!(form.meta_account_id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure API connections and integration credentials</p>
      </div>

      {/* Connection Status */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Integration Status
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ConnectionStatus connected={shipheroConnected} label="ShipHero" />
          <ConnectionStatus connected={shopifyConnected} label="Shopify" />
          <ConnectionStatus connected={slackConnected} label="Slack" />
          <ConnectionStatus connected={metaConnected} label="Meta Ads" />
        </CardContent>
      </Card>

      {/* ShipHero */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">ShipHero API</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">ShipHero API Token</Label>
            <Input
              type="password"
              value={form.shiphero_token}
              onChange={(e) => setForm({ ...form, shiphero_token: e.target.value })}
              placeholder="Your ShipHero API token"
              className="bg-background border-border mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Found in ShipHero → Settings → API. Used for product sync, POs, and shipments.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Shopify */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Shopify API</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Store URL</Label>
              <Input
                value={form.shopify_store}
                onChange={(e) => setForm({ ...form, shopify_store: e.target.value })}
                placeholder="yourstore.myshopify.com"
                className="bg-background border-border mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Admin API Token</Label>
              <Input
                type="password"
                value={form.shopify_token}
                onChange={(e) => setForm({ ...form, shopify_token: e.target.value })}
                placeholder="shpat_..."
                className="bg-background border-border mt-1"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Shopify Admin → Apps → Develop apps → Create app. Requires read_orders, read_products, write_products scopes.
          </p>
        </CardContent>
      </Card>

      {/* Slack */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Slack Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Webhook URL</Label>
              <Input
                type="password"
                value={form.slack_webhook}
                onChange={(e) => setForm({ ...form, slack_webhook: e.target.value })}
                placeholder="https://hooks.slack.com/services/..."
                className="bg-background border-border mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Channel (optional)</Label>
              <Input
                value={form.slack_channel}
                onChange={(e) => setForm({ ...form, slack_channel: e.target.value })}
                placeholder="#stock-alerts"
                className="bg-background border-border mt-1"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Create an incoming webhook at api.slack.com/apps. Alerts will be sent for critical stock, overdue POs, and weekly reports.
          </p>
        </CardContent>
      </Card>

      {/* Meta Ads */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Meta Ads</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Ad Account ID</Label>
            <Input
              value={form.meta_account_id}
              onChange={(e) => setForm({ ...form, meta_account_id: e.target.value })}
              placeholder="act_123456789"
              className="bg-background border-border mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Meta Ads Manager → Account → Account ID. Used for spend correlation in forecasting.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button
          onClick={() => runSync.mutate()}
          disabled={runSync.isPending}
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${runSync.isPending ? "animate-spin" : ""}`} />
          {runSync.isPending ? "Syncing..." : "Run Full Sync"}
        </Button>
        <Button onClick={handleSave} disabled={saveOneSetting.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {saveOneSetting.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      {/* Sync Logs */}
      {(syncLogs ?? []).length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Recent Sync Logs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Message</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(syncLogs ?? []).map((log: any) => (
                    <tr key={log.id} className="hover:bg-accent/30">
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{log.syncType}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold ${log.status === "SUCCESS" ? "text-green-400" : log.status === "ERROR" ? "text-red-400" : "text-yellow-400"}`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-sm truncate">{log.message ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

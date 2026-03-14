import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PriorityBadge, TierBadge, DaysLeftBar } from "@/components/StockBadges";
import { RefreshCw, Search, AlertTriangle, Package, TrendingUp, Zap, ShoppingCart } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function StockDashboard() {
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();

  const { data: summary, refetch: refetchSummary } = trpc.stock.summary.useQuery();
  const { data: stocks, isLoading, refetch } = trpc.stock.list.useQuery(
    search ? { search } : undefined
  );
  const syncMutation = trpc.sync.runFull.useMutation({
    onSuccess: (data) => {
      toast.success(`Sync complete — ${data.products} products, ${data.velocity.skusUpdated} velocities updated`);
      refetch();
      refetchSummary();
    },
    onError: (err) => toast.error(`Sync failed: ${err.message}`),
  });

  const sorted = useMemo(() => {
    if (!stocks) return [];
    const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, PRE_ORDER: 4, OK: 5 };
    return [...stocks].sort((a, b) => {
      const diff = (order[a.priority] ?? 5) - (order[b.priority] ?? 5);
      if (diff !== 0) return diff;
      return b.dailyVelocity - a.dailyVelocity;
    });
  }, [stocks]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Stock Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time inventory levels with AI-powered forecasting</p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Syncing..." : "Sync Now"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <SummaryCard
          label="Total SKUs"
          value={summary?.total ?? 0}
          icon={<Package className="h-4 w-4" />}
          color="text-foreground"
        />
        <SummaryCard
          label="Critical"
          value={summary?.critical ?? 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          color="text-red-400"
          highlight={!!summary?.critical}
        />
        <SummaryCard
          label="High"
          value={summary?.high ?? 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          color="text-orange-400"
        />
        <SummaryCard
          label="Medium"
          value={summary?.medium ?? 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          color="text-yellow-400"
        />
        <SummaryCard
          label="Low"
          value={summary?.low ?? 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          color="text-green-400"
        />
        <SummaryCard
          label="Out of Stock"
          value={summary?.oos ?? 0}
          icon={<Zap className="h-4 w-4" />}
          color="text-red-500"
          highlight={!!summary?.oos}
        />
        <SummaryCard
          label="Best Sellers"
          value={summary?.bestSellers ?? 0}
          icon={<TrendingUp className="h-4 w-4" />}
          color="text-amber-400"
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search SKU or product name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card border-border"
        />
      </div>

      {/* Stock Table */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Inventory — {sorted.length} SKUs
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading inventory...
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No products found</p>
              <p className="text-sm mt-1">Run a sync to pull data from ShipHero</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => syncMutation.mutate()}
              >
                Sync Now
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priority</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">SKU / Product</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Velocity/day</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-40">Days Left</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tier</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order Qty</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">ETA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {sorted.map((item) => (
                    <tr
                      key={item.sku}
                      className={`hover:bg-accent/30 transition-colors ${
                        item.priority === "CRITICAL" ? "bg-red-500/5" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <PriorityBadge priority={item.priority as any} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{item.sku}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">
                          {item.oosDays > 0 && (
                            <span className="text-orange-400 mr-1">❄️ OOS {item.oosDays}d</span>
                          )}
                          {item.isPreOrder && (
                            <span className="text-purple-400 mr-1">⏳ Pre-Order</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold tabular-nums ${
                          item.currentStock <= 0 ? "text-red-400" :
                          item.currentStock < 50 ? "text-orange-400" :
                          "text-foreground"
                        }`}>
                          {item.currentStock.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-sm text-foreground">
                          {item.dailyVelocity > 0 ? Number(item.dailyVelocity).toFixed(1) : "—"}
                        </span>
                        {item.oosDays > 0 && item.frozenVelocity && (
                          <div className="text-xs text-orange-400/70">
                            frozen: {Number(item.frozenVelocity).toFixed(1)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 w-40">
                        <DaysLeftBar days={item.daysOfStockLeft} />
                      </td>
                      <td className="px-4 py-3">
                        <TierBadge tier={item.performanceTier as any} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-primary tabular-nums">
                          {item.smartOrderQty > 0 ? item.smartOrderQty.toLocaleString() : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {item.expectedDeliveryDate ? (
                          <span className="text-green-400 text-xs">
                            {new Date(item.expectedDeliveryDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                          </span>
                        ) : item.priority === "CRITICAL" ? (
                          <span className="text-red-400 text-xs font-medium">⚠ No ETA</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color,
  highlight,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`border-border bg-card ${highlight ? "glow-critical" : ""}`}>
      <CardContent className="p-3">
        <div className={`flex items-center gap-1.5 mb-1 ${color}`}>
          {icon}
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <div className={`text-2xl font-bold tabular-nums ${color}`}>
          {value.toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}

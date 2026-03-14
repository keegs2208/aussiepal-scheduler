import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TierBadge, PriorityBadge } from "@/components/StockBadges";
import { TrendingUp, BarChart3, Zap } from "lucide-react";
import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
  ComposedChart,
} from "recharts";

export default function ForecastPage() {
  const [selectedSku, setSelectedSku] = useState<string>("");
  const [days, setDays] = useState(90);

  const { data: topVelocity } = trpc.forecast.topVelocity.useQuery();
  const { data: metaSpend } = trpc.forecast.metaSpendHistory.useQuery({ days });
  const { data: velocityHistory } = trpc.forecast.velocityHistory.useQuery(
    { sku: selectedSku, days },
    { enabled: !!selectedSku }
  );
  const { data: correlation } = trpc.forecast.spendCorrelation.useQuery(
    { sku: selectedSku, days },
    { enabled: !!selectedSku }
  );

  const metaChartData = useMemo(() => {
    if (!metaSpend) return [];
    return metaSpend.map((d) => ({
      date: new Date(d.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
      spend: Number(d.spend),
      purchases: d.purchases ?? 0,
      roas: Number(d.roas ?? 0),
    }));
  }, [metaSpend]);

  const velocityChartData = useMemo(() => {
    if (!velocityHistory) return [];
    return velocityHistory.map((d) => ({
      date: new Date(d.snapshotDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
      velocity: Number(d.dailyVelocity),
      units: d.unitsSold ?? 0,
      stock: d.stockLevel ?? 0,
      oos: d.wasOos ? 1 : 0,
    }));
  }, [velocityHistory]);

  const totalSpend = metaChartData.reduce((s, d) => s + d.spend, 0);
  const avgDailySpend = metaChartData.length > 0 ? totalSpend / metaChartData.length : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Forecasting & Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Velocity trends, OOS history, and Meta Ads spend correlation</p>
      </div>

      {/* Meta Ads Spend Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Total Ad Spend ({days}d)</div>
            <div className="text-2xl font-bold text-primary">
              ${totalSpend.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Avg Daily Spend</div>
            <div className="text-2xl font-bold text-foreground">
              ${avgDailySpend.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Data Period</div>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="bg-card border-border h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="60">Last 60 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="180">Last 180 days</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* Meta Ads Spend Chart */}
      {metaChartData.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Meta Ads Daily Spend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={metaChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.02 240)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "oklch(0.60 0.02 240)" }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "oklch(0.60 0.02 240)" }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "oklch(0.60 0.02 240)" }} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.16 0.02 240)", border: "1px solid oklch(0.25 0.02 240)", borderRadius: "8px" }}
                  labelStyle={{ color: "oklch(0.95 0.01 240)" }}
                />
                <Bar yAxisId="left" dataKey="spend" fill="oklch(0.78 0.15 75 / 0.7)" name="Spend ($)" radius={[2, 2, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="purchases" stroke="oklch(0.65 0.15 200)" strokeWidth={2} dot={false} name="Purchases" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Velocity SKUs */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Top Velocity SKUs
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">SKU</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Velocity/day</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sold 28d</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tier</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priority</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order Qty</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Analyse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {(topVelocity ?? []).map((item, idx) => (
                  <tr
                    key={item.sku}
                    className={`hover:bg-accent/30 transition-colors ${selectedSku === item.sku ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-4 py-3 text-muted-foreground text-xs">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{item.sku}</div>
                      {item.oosDays > 0 && (
                        <div className="text-xs text-orange-400">❄️ OOS {item.oosDays}d</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                      {Number(item.dailyVelocity).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {item.totalSold28d.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <TierBadge tier={item.performanceTier as any} />
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={item.priority as any} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-primary tabular-nums">
                      {item.smartOrderQty > 0 ? item.smartOrderQty.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedSku(selectedSku === item.sku ? "" : item.sku)}
                        className="text-xs text-primary hover:underline"
                      >
                        {selectedSku === item.sku ? "Hide" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* SKU Detail Charts */}
      {selectedSku && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Analysis: {selectedSku}
          </h2>

          {/* Velocity History Chart */}
          {velocityChartData.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Daily Velocity & Stock Level</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={velocityChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.02 240)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.60 0.02 240)" }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "oklch(0.60 0.02 240)" }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "oklch(0.60 0.02 240)" }} />
                    <Tooltip
                      contentStyle={{ background: "oklch(0.16 0.02 240)", border: "1px solid oklch(0.25 0.02 240)", borderRadius: "8px" }}
                    />
                    <Area yAxisId="right" type="monotone" dataKey="stock" fill="oklch(0.65 0.15 200 / 0.1)" stroke="oklch(0.65 0.15 200 / 0.5)" strokeWidth={1} name="Stock Level" />
                    <Line yAxisId="left" type="monotone" dataKey="velocity" stroke="oklch(0.78 0.15 75)" strokeWidth={2} dot={false} name="Velocity/day" />
                    <Bar yAxisId="left" dataKey="units" fill="oklch(0.65 0.18 55 / 0.5)" name="Units Sold" radius={[1, 1, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Correlation Card */}
          {correlation && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Meta Ads Spend Correlation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Correlation (r)</div>
                    <div className={`text-xl font-bold ${
                      Math.abs(correlation.correlationCoefficient) > 0.7 ? "text-green-400" :
                      Math.abs(correlation.correlationCoefficient) > 0.4 ? "text-yellow-400" :
                      "text-muted-foreground"
                    }`}>
                      {correlation.correlationCoefficient.toFixed(3)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Avg Spend/Unit</div>
                    <div className="text-xl font-bold text-foreground">
                      ${correlation.avgSpendPerUnit.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">High Spend Multiplier</div>
                    <div className="text-xl font-bold text-primary">
                      {correlation.highSpendMultiplier.toFixed(2)}x
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                  {correlation.recommendation}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

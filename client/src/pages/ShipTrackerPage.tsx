import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ship, Package, RefreshCw, ExternalLink, ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";

const inboundStatusColors: Record<string, string> = {
  PENDING: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  IN_TRANSIT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  AT_PORT: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  CUSTOMS: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  DELIVERED: "bg-green-500/15 text-green-400 border-green-500/30",
  CANCELLED: "bg-red-500/15 text-red-400 border-red-500/30",
};

const outboundStatusColors: Record<string, string> = {
  PENDING: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  PROCESSING: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  SHIPPED: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DELIVERED: "bg-green-500/15 text-green-400 border-green-500/30",
  RETURNED: "bg-red-500/15 text-red-400 border-red-500/30",
  CANCELLED: "bg-slate-600/15 text-slate-500 border-slate-600/30",
};

export default function ShipTrackerPage() {
  const { data: inbound, isLoading: inboundLoading, refetch: refetchInbound } = trpc.shipments.inbound.useQuery();
  const { data: outbound, isLoading: outboundLoading, refetch: refetchOutbound } = trpc.shipments.outbound.useQuery();
  const syncShipments = trpc.sync.syncShipments.useMutation({
    onSuccess: (d) => { toast.success(`Synced ${d.synced} inbound shipments`); refetchInbound(); },
    onError: (e) => toast.error(`Sync failed: ${e.message}`),
  });

  const inboundActive = (inbound ?? []).filter((s) => !["DELIVERED", "CANCELLED"].includes(s.status));
  const inboundDelivered = (inbound ?? []).filter((s) => s.status === "DELIVERED");
  const outboundActive = (outbound ?? []).filter((s) => !["DELIVERED", "CANCELLED", "RETURNED"].includes(s.status));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ship Tracker</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track inbound supplier shipments and outbound customer orders</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => syncShipments.mutate()} disabled={syncShipments.isPending} className="gap-2">
          <RefreshCw className={`h-3.5 w-3.5 ${syncShipments.isPending ? "animate-spin" : ""}`} />
          Sync Shipments
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border bg-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowDown className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-xs text-muted-foreground">Inbound Active</span>
            </div>
            <div className="text-2xl font-bold text-blue-400">{inboundActive.length}</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowDown className="h-3.5 w-3.5 text-green-400" />
              <span className="text-xs text-muted-foreground">Inbound Delivered</span>
            </div>
            <div className="text-2xl font-bold text-green-400">{inboundDelivered.length}</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowUp className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs text-muted-foreground">Outbound Active</span>
            </div>
            <div className="text-2xl font-bold text-amber-400">{outboundActive.length}</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Ship className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">Total Tracked</span>
            </div>
            <div className="text-2xl font-bold text-primary">
              {(inbound?.length ?? 0) + (outbound?.length ?? 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inbound">
        <TabsList className="bg-muted/30 border border-border">
          <TabsTrigger value="inbound" className="gap-2">
            <ArrowDown className="h-3.5 w-3.5" />
            Inbound ({inbound?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="outbound" className="gap-2">
            <ArrowUp className="h-3.5 w-3.5" />
            Outbound ({outbound?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbound" className="mt-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ArrowDown className="h-4 w-4 text-blue-400" />
                Inbound Shipments — Supplier Stock
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {inboundLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading...
                </div>
              ) : (inbound ?? []).length === 0 ? (
                <EmptyState icon={<ArrowDown className="h-8 w-8" />} title="No inbound shipments" subtitle="Sync from ShipHero to see incoming stock" />
              ) : (
                <ShipmentTable
                  rows={(inbound ?? []).map((s) => ({
                    id: s.id,
                    ref: s.poNumber ?? s.shipheroShipmentId ?? `#${s.id}`,
                    vendor: s.vendorName ?? "—",
                    status: s.status,
                    statusColors: inboundStatusColors,
                    carrier: s.carrier ?? "—",
                    tracking: s.trackingNumber,
                    trackingUrl: s.trackingUrl,
                    eta: s.estimatedArrival ? new Date(s.estimatedArrival) : null,
                    units: s.totalUnits ?? 0,
                    destination: s.destinationWarehouse ?? "—",
                    createdAt: new Date(s.createdAt),
                  }))}
                  columns={["Ref", "Vendor", "Status", "Carrier", "Tracking", "ETA", "Units", "Warehouse", "Created"]}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outbound" className="mt-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ArrowUp className="h-4 w-4 text-amber-400" />
                Outbound Shipments — Customer Orders
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {outboundLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading...
                </div>
              ) : (outbound ?? []).length === 0 ? (
                <EmptyState icon={<ArrowUp className="h-8 w-8" />} title="No outbound shipments" subtitle="Outbound shipments will appear here after syncing" />
              ) : (
                <ShipmentTable
                  rows={(outbound ?? []).map((s) => ({
                    id: s.id,
                    ref: s.orderNumber ?? s.shipheroOrderId ?? `#${s.id}`,
                    vendor: s.customerName ?? "Customer",
                    status: s.status,
                    statusColors: outboundStatusColors,
                    carrier: s.carrier ?? "—",
                    tracking: s.trackingNumber,
                    trackingUrl: s.trackingUrl,
                    eta: s.estimatedDelivery ? new Date(s.estimatedDelivery) : null,
                    units: s.totalItems ?? 0,
                    destination: "Customer",
                    createdAt: new Date(s.createdAt),
                  }))}
                  columns={["Order", "Customer", "Status", "Carrier", "Tracking", "Est. Delivery", "Items", "Destination", "Created"]}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ShipmentTable({
  rows,
  columns,
}: {
  rows: Array<{
    id: number;
    ref: string;
    vendor: string;
    status: string;
    statusColors: Record<string, string>;
    carrier: string;
    tracking: string | null;
    trackingUrl: string | null;
    eta: Date | null;
    units: number;
    destination: string;
    createdAt: Date;
  }>;
  columns: string[];
}) {
  const isOverdue = (row: typeof rows[0]) =>
    row.eta && row.eta < new Date() && !["DELIVERED", "CANCELLED", "RETURNED"].includes(row.status);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {columns.map((c) => (
              <th key={c} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((row) => (
            <tr key={row.id} className={`hover:bg-accent/30 transition-colors ${isOverdue(row) ? "bg-red-500/5" : ""}`}>
              <td className="px-4 py-3 font-mono font-medium text-foreground">{row.ref}</td>
              <td className="px-4 py-3 text-foreground">{row.vendor}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${row.statusColors[row.status] ?? ""}`}>
                  {row.status}
                </span>
                {isOverdue(row) && <div className="text-xs text-red-400 mt-0.5">⚠ Overdue</div>}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{row.carrier}</td>
              <td className="px-4 py-3">
                {row.tracking ? (
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs text-foreground">{row.tracking}</span>
                    {row.trackingUrl && (
                      <a href={row.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ) : "—"}
              </td>
              <td className="px-4 py-3">
                {row.eta ? (
                  <span className={isOverdue(row) ? "text-red-400" : "text-green-400"}>
                    {row.eta.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                ) : "—"}
              </td>
              <td className="px-4 py-3 tabular-nums text-foreground">{row.units.toLocaleString()}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{row.destination}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">
                {row.createdAt.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="p-8 text-center text-muted-foreground">
      <div className="mx-auto mb-3 opacity-30 w-8 h-8">{icon}</div>
      <p className="font-medium">{title}</p>
      <p className="text-sm mt-1">{subtitle}</p>
    </div>
  );
}

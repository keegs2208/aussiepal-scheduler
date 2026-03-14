import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Plus, Trash2, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type LineItem = { sku: string; productName: string; colour: string; quantityOrdered: number; unitCost: number };

const statusColors: Record<string, string> = {
  DRAFT: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  SUBMITTED: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  CONFIRMED: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  IN_TRANSIT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  RECEIVED: "bg-green-500/15 text-green-400 border-green-500/30",
  CANCELLED: "bg-red-500/15 text-red-400 border-red-500/30",
  OVERDUE: "bg-red-600/20 text-red-300 border-red-600/40",
};

export default function PurchaseOrdersPage() {
  const [open, setOpen] = useState(false);
  const [poNumber, setPoNumber] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [syncToShipHero, setSyncToShipHero] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { sku: "", productName: "", colour: "", quantityOrdered: 0, unitCost: 0 },
  ]);

  const { data: pos, isLoading, refetch } = trpc.purchaseOrders.list.useQuery();
  const syncPOs = trpc.sync.syncPOs.useMutation({
    onSuccess: (d) => { toast.success(`Synced ${d.synced} POs from ShipHero`); refetch(); },
    onError: (e) => toast.error(`Sync failed: ${e.message}`),
  });
  const createPO = trpc.purchaseOrders.create.useMutation({
    onSuccess: () => {
      toast.success("Purchase order created");
      setOpen(false);
      refetch();
      resetForm();
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });
  const updateStatus = trpc.purchaseOrders.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetch(); },
  });

  function resetForm() {
    setPoNumber(""); setVendorName(""); setExpectedDate(""); setNotes("");
    setLineItems([{ sku: "", productName: "", colour: "", quantityOrdered: 0, unitCost: 0 }]);
  }

  function addLineItem() {
    setLineItems([...lineItems, { sku: "", productName: "", colour: "", quantityOrdered: 0, unitCost: 0 }]);
  }

  function removeLineItem(i: number) {
    setLineItems(lineItems.filter((_, idx) => idx !== i));
  }

  function updateLineItem(i: number, field: keyof LineItem, value: string | number) {
    const updated = [...lineItems];
    (updated[i] as any)[field] = value;
    setLineItems(updated);
  }

  function handleSubmit() {
    if (!poNumber.trim()) return toast.error("PO number is required");
    const validItems = lineItems.filter((li) => li.sku.trim() && li.quantityOrdered > 0);
    if (validItems.length === 0) return toast.error("At least one line item with SKU and quantity is required");
    createPO.mutate({ poNumber, vendorName, expectedDeliveryDate: expectedDate || undefined, notes, syncToShipHero, lineItems: validItems });
  }

  const overdueCount = (pos ?? []).filter((p) => p.status === "OVERDUE").length;
  const inTransitCount = (pos ?? []).filter((p) => p.status === "IN_TRANSIT").length;
  const pendingCount = (pos ?? []).filter((p) => ["DRAFT", "SUBMITTED", "CONFIRMED"].includes(p.status)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage and track all supplier purchase orders</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => syncPOs.mutate()} disabled={syncPOs.isPending} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${syncPOs.isPending ? "animate-spin" : ""}`} />
            Sync ShipHero
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-3.5 w-3.5" />
                New PO
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl bg-card border-border max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Purchase Order</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">PO Number *</Label>
                    <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-2026-001" className="bg-background border-border mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Vendor Name</Label>
                    <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Supplier name" className="bg-background border-border mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Expected Delivery Date</Label>
                    <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="bg-background border-border mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" className="bg-background border-border mt-1" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-muted-foreground">Line Items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addLineItem} className="h-7 text-xs gap-1">
                      <Plus className="h-3 w-3" /> Add Item
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {lineItems.map((li, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center">
                        <Input value={li.sku} onChange={(e) => updateLineItem(i, "sku", e.target.value)} placeholder="SKU" className="col-span-3 bg-background border-border text-sm h-8" />
                        <Input value={li.productName} onChange={(e) => updateLineItem(i, "productName", e.target.value)} placeholder="Product name" className="col-span-3 bg-background border-border text-sm h-8" />
                        <Input value={li.colour} onChange={(e) => updateLineItem(i, "colour", e.target.value)} placeholder="Colour" className="col-span-2 bg-background border-border text-sm h-8" />
                        <Input type="number" value={li.quantityOrdered || ""} onChange={(e) => updateLineItem(i, "quantityOrdered", Number(e.target.value))} placeholder="Qty" className="col-span-2 bg-background border-border text-sm h-8" />
                        <Input type="number" value={li.unitCost || ""} onChange={(e) => updateLineItem(i, "unitCost", Number(e.target.value))} placeholder="Cost" className="col-span-1 bg-background border-border text-sm h-8" />
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeLineItem(i)} className="col-span-1 h-8 w-8 p-0 text-muted-foreground hover:text-red-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="syncShipHero" checked={syncToShipHero} onChange={(e) => setSyncToShipHero(e.target.checked)} className="rounded" />
                  <Label htmlFor="syncShipHero" className="text-sm cursor-pointer">Also create in ShipHero</Label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={handleSubmit} disabled={createPO.isPending}>
                    {createPO.isPending ? "Creating..." : "Create PO"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className={`border-border bg-card ${overdueCount > 0 ? "glow-critical" : ""}`}>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              {overdueCount > 0 && <AlertTriangle className="h-3 w-3 text-red-400" />}
              Overdue
            </div>
            <div className={`text-2xl font-bold ${overdueCount > 0 ? "text-red-400" : "text-muted-foreground"}`}>{overdueCount}</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground mb-1">In Transit</div>
            <div className="text-2xl font-bold text-amber-400">{inTransitCount}</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground mb-1">Pending</div>
            <div className="text-2xl font-bold text-blue-400">{pendingCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* PO Table */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            All Purchase Orders ({(pos ?? []).length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
              Loading...
            </div>
          ) : (pos ?? []).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <ShoppingCart className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No purchase orders</p>
              <p className="text-sm mt-1">Create a new PO or sync from ShipHero</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">PO Number</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendor</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Units</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Value</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expected</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(pos ?? []).map((po) => {
                    const isOverdue = po.status === "OVERDUE" || (
                      po.expectedDeliveryDate &&
                      new Date(po.expectedDeliveryDate) < new Date() &&
                      !["RECEIVED", "CANCELLED"].includes(po.status)
                    );
                    return (
                      <tr key={po.id} className={`hover:bg-accent/30 transition-colors ${isOverdue ? "bg-red-500/5" : ""}`}>
                        <td className="px-4 py-3">
                          <span className="font-mono font-medium text-foreground">{po.poNumber}</span>
                          {po.shipheroPoId && <div className="text-xs text-muted-foreground">SH: {po.shipheroPoId}</div>}
                        </td>
                        <td className="px-4 py-3 text-foreground">{po.vendorName ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${statusColors[po.status] ?? ""}`}>
                            {po.status}
                          </span>
                          {isOverdue && po.status !== "OVERDUE" && (
                            <div className="text-xs text-red-400 mt-0.5">⚠ Overdue</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">{(po.totalUnits ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">
                          {po.totalCost ? `$${Number(po.totalCost).toLocaleString("en-AU", { minimumFractionDigits: 0 })}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {po.expectedDeliveryDate ? (
                            <span className={isOverdue ? "text-red-400" : "text-green-400"}>
                              {new Date(po.expectedDeliveryDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {new Date(po.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                        </td>
                        <td className="px-4 py-3">
                          <Select
                            value={po.status}
                            onValueChange={(v) => updateStatus.mutate({ id: po.id, status: v as any })}
                          >
                            <SelectTrigger className="h-7 text-xs w-32 bg-background border-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["DRAFT", "SUBMITTED", "CONFIRMED", "IN_TRANSIT", "RECEIVED", "CANCELLED", "OVERDUE"].map((s) => (
                                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

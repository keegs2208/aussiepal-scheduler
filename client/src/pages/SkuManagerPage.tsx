import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Boxes, Plus, RefreshCw, Search, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function SkuManagerPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    sku: "", name: "", barcode: "", weight: "", countryOfOrigin: "",
    price: "", cost: "", addToShipHero: true, addToShopify: true,
  });

  const { data: products, isLoading, refetch } = trpc.sku.list.useQuery(
    search ? { search } : undefined
  );
  const createSku = trpc.sku.create.useMutation({
    onSuccess: (d) => {
      toast.success(
        `SKU created${d.shiphero ? " in ShipHero" : ""}${d.shopify ? " & Shopify" : ""}`
      );
      setOpen(false);
      refetch();
      setForm({ sku: "", name: "", barcode: "", weight: "", countryOfOrigin: "", price: "", cost: "", addToShipHero: true, addToShopify: true });
    },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  function handleSubmit() {
    if (!form.sku.trim() || !form.name.trim()) return toast.error("SKU and name are required");
    createSku.mutate({
      sku: form.sku,
      productName: form.name,
      barcode: form.barcode || undefined,
      price: form.price ? String(form.price) : undefined,
      addToShipHero: form.addToShipHero,
      addToShopify: form.addToShopify,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SKU Manager</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Add and manage products across ShipHero and Shopify</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-3.5 w-3.5" />
              Add SKU
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-card border-border">
            <DialogHeader>
              <DialogTitle>Add New SKU</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">SKU *</Label>
                  <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="AP-PROD-001" className="bg-background border-border mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Product Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product name" className="bg-background border-border mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Barcode / UPC</Label>
                  <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="123456789" className="bg-background border-border mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Weight (kg)</Label>
                  <Input type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} placeholder="0.5" className="bg-background border-border mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Retail Price ($)</Label>
                  <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="29.99" className="bg-background border-border mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Cost Price ($)</Label>
                  <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="12.50" className="bg-background border-border mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Country of Origin</Label>
                  <Input value={form.countryOfOrigin} onChange={(e) => setForm({ ...form, countryOfOrigin: e.target.value })} placeholder="CN" className="bg-background border-border mt-1" />
                </div>
              </div>

              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.addToShipHero} onChange={(e) => setForm({ ...form, addToShipHero: e.target.checked })} className="rounded" />
                  <span className="text-sm">Add to ShipHero</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.addToShopify} onChange={(e) => setForm({ ...form, addToShopify: e.target.checked })} className="rounded" />
                  <span className="text-sm">Add to Shopify</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={createSku.isPending}>
                  {createSku.isPending ? "Creating..." : "Create SKU"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search SKU or product name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card border-border"
        />
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Boxes className="h-4 w-4 text-primary" />
            Products ({(products ?? []).length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading...
            </div>
          ) : (products ?? []).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Boxes className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No products found</p>
              <p className="text-sm mt-1">Add a SKU or run a sync to import from ShipHero</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">SKU</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product Name</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Price</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cost</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">ShipHero</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shopify</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Country</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(products ?? []).map((p: any) => (
                    <tr key={p.sku} className="hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">{p.sku}</td>
                      <td className="px-4 py-3 text-foreground max-w-xs truncate">{p.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {(p.currentStock ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {p.price ? `$${Number(p.price).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {p.cost ? `$${Number(p.cost).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.shipheroProductId ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400 mx-auto" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.shopifyProductId ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400 mx-auto" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{p.countryOfOrigin ?? "—"}</td>
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

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, RefreshCw, CheckCheck, AlertTriangle, Send } from "lucide-react";
import { PriorityBadge } from "@/components/StockBadges";
import { toast } from "sonner";

export default function AlertsPage() {
  const { data: alerts, isLoading, refetch } = trpc.alerts.list.useQuery();
  const markRead = trpc.alerts.markRead.useMutation({
    onSuccess: () => refetch(),
  });
  const markAllRead = trpc.alerts.markAllRead.useMutation({
    onSuccess: () => { toast.success("All alerts marked as read"); refetch(); },
  });
  const sendSlack = trpc.alerts.sendSlackDigest.useMutation({
    onSuccess: () => toast.success("Slack digest sent"),
    onError: (e) => toast.error(`Slack send failed: ${e.message}`),
  });

  const unread = (alerts ?? []).filter((a: any) => !a.isRead);
  const critical = (alerts ?? []).filter((a: any) => a.severity === "CRITICAL" && !a.isRead);

  const severityColor: Record<string, string> = {
    CRITICAL: "border-l-red-500 bg-red-500/5",
    HIGH: "border-l-orange-500 bg-orange-500/5",
    MEDIUM: "border-l-yellow-500 bg-yellow-500/5",
    LOW: "border-l-green-500 bg-green-500/5",
    INFO: "border-l-blue-500 bg-blue-500/5",
  };

  const severityBadgeColor: Record<string, string> = {
    CRITICAL: "priority-critical",
    HIGH: "priority-high",
    MEDIUM: "priority-medium",
    LOW: "priority-low",
    INFO: "priority-ok",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Alerts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {unread.length > 0 ? `${unread.length} unread alert${unread.length !== 1 ? "s" : ""}` : "All caught up"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => sendSlack.mutate()} disabled={sendSlack.isPending} className="gap-2">
            <Send className={`h-3.5 w-3.5 ${sendSlack.isPending ? "animate-pulse" : ""}`} />
            Send Slack Digest
          </Button>
          {unread.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending} className="gap-2">
              <CheckCheck className="h-3.5 w-3.5" />
              Mark All Read
            </Button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className={`border-border bg-card ${(critical as any[]).length > 0 ? "glow-critical" : ""}`}>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              {critical.length > 0 && <AlertTriangle className="h-3 w-3 text-red-400" />}
              Critical Unread
            </div>
            <div className={`text-2xl font-bold ${(critical as any[]).length > 0 ? "text-red-400" : "text-muted-foreground"}`}>
              {(critical as any[]).length}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground mb-1">Total Unread</div>
            <div className="text-2xl font-bold text-primary">{unread.length}</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground mb-1">Total Alerts</div>
            <div className="text-2xl font-bold text-foreground">{(alerts ?? [] as any[]).length}</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground mb-1">Read</div>
            <div className="text-2xl font-bold text-muted-foreground">
              {(alerts ?? [] as any[]).filter((a: any) => a.isRead).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts List */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Alert Feed
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading...
            </div>
          ) : (alerts ?? []).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No alerts</p>
              <p className="text-sm mt-1">Alerts will appear here when stock events occur</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {(alerts ?? [] as any[]).map((alert: any) => (
                <div
                  key={alert.id}
                  className={`flex items-start gap-4 px-4 py-3 border-l-2 transition-opacity ${
                    severityColor[alert.severity] ?? "border-l-border"
                  } ${alert.isRead ? "opacity-50" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${severityBadgeColor[alert.severity] ?? ""}`}>
                        {alert.severity}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">{alert.alertType}</span>
                      {alert.sku && (
                        <span className="text-xs font-mono text-primary">{alert.sku}</span>
                      )}
                    </div>
                    <p className="text-sm text-foreground">{alert.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(alert.createdAt).toLocaleString("en-AU", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                      {alert.slackSent && <span className="ml-2 text-green-400">✓ Slack sent</span>}
                    </p>
                  </div>
                  {!alert.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markRead.mutate({ id: alert.id })}
                      className="h-7 text-xs text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

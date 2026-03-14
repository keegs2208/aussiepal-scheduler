import { cn } from "@/lib/utils";

type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "OK" | "PRE_ORDER";
type Tier = "BEST_SELLER" | "STEADY" | "SLOW_MOVER";

export function PriorityBadge({ priority }: { priority: Priority }) {
  const labels: Record<Priority, string> = {
    CRITICAL: "Critical",
    HIGH: "High",
    MEDIUM: "Medium",
    LOW: "Low",
    OK: "OK",
    PRE_ORDER: "Pre-Order",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold tracking-wide",
        `priority-${priority.toLowerCase()}`
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {labels[priority]}
    </span>
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  const labels: Record<Tier, string> = {
    BEST_SELLER: "🔥 Best Seller",
    STEADY: "Steady",
    SLOW_MOVER: "🐢 Slow Mover",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium",
        `tier-${tier.toLowerCase()}`
      )}
    >
      {labels[tier]}
    </span>
  );
}

export function DaysLeftBar({ days, max = 150 }: { days: number; max?: number }) {
  const pct = Math.min(100, (days / max) * 100);
  const color =
    days <= 30 ? "bg-red-500" :
    days <= 60 ? "bg-orange-500" :
    days <= 90 ? "bg-yellow-500" :
    days <= 120 ? "bg-green-500" :
    "bg-blue-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn(
        "text-xs font-semibold tabular-nums w-14 text-right",
        days <= 30 ? "text-red-400" :
        days <= 60 ? "text-orange-400" :
        days <= 90 ? "text-yellow-400" :
        "text-green-400"
      )}>
        {days >= 999 ? "∞" : `${Math.round(days)}d`}
      </span>
    </div>
  );
}

export function StockStatusDot({ priority }: { priority: Priority }) {
  const colors: Record<Priority, string> = {
    CRITICAL: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]",
    HIGH: "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]",
    MEDIUM: "bg-yellow-500",
    LOW: "bg-green-500",
    OK: "bg-blue-500",
    PRE_ORDER: "bg-purple-500",
  };

  return (
    <span className={cn("inline-block w-2 h-2 rounded-full", colors[priority])} />
  );
}

export function ConnectionStatus({ connected, label }: { connected: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn(
        "w-2 h-2 rounded-full",
        connected ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.8)]" : "bg-red-500"
      )} />
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn(
        "text-xs font-medium",
        connected ? "text-green-400" : "text-red-400"
      )}>
        {connected ? "Connected" : "Not Connected"}
      </span>
    </div>
  );
}

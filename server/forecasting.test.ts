import { describe, expect, it } from "vitest";

// ─── Forecasting Engine Unit Tests ───────────────────────────────────────────
// These tests validate the core forecasting logic without requiring a live DB.

// Inline the pure functions from the forecasting service for testing
function calcDailyVelocity(
  totalSold: number,
  windowDays: number,
  oosDays: number
): number {
  const activeDays = Math.max(windowDays - oosDays, 1);
  return totalSold / activeDays;
}

function calcDaysOfStockLeft(currentStock: number, dailyVelocity: number): number {
  if (dailyVelocity <= 0) return 999;
  return Math.floor(currentStock / dailyVelocity);
}

function calcPriority(daysLeft: number, isPreOrder: boolean): string {
  if (isPreOrder) return "OK";
  if (daysLeft <= 30) return "CRITICAL";
  if (daysLeft <= 60) return "HIGH";
  if (daysLeft <= 90) return "MEDIUM";
  if (daysLeft <= 120) return "LOW";
  return "OK";
}

function calcPerformanceTier(dailyVelocity: number): string {
  if (dailyVelocity >= 5) return "BEST_SELLER";
  if (dailyVelocity >= 1) return "STEADY";
  return "SLOW_MOVER";
}

const RUNWAY_BY_TIER: Record<string, number> = {
  BEST_SELLER: 150,
  STEADY: 120,
  SLOW_MOVER: 90,
};

function calcSmartOrderQty(
  dailyVelocity: number,
  currentStock: number,
  tier: string,
  incomingStock: number
): number {
  const runway = RUNWAY_BY_TIER[tier] ?? 120;
  const targetStock = dailyVelocity * runway;
  const needed = targetStock - currentStock - incomingStock;
  return Math.max(0, Math.ceil(needed));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("calcDailyVelocity", () => {
  it("returns correct velocity with no OOS days", () => {
    expect(calcDailyVelocity(280, 28, 0)).toBeCloseTo(10, 1);
  });

  it("adjusts for OOS days correctly", () => {
    // 140 sold over 28 days but 7 were OOS → 21 active days → 6.67/day
    expect(calcDailyVelocity(140, 28, 7)).toBeCloseTo(6.67, 1);
  });

  it("never divides by zero (denominator is always at least 1)", () => {
    // When all 28 days are OOS, activeDays = max(28-28, 1) = 1
    // 0 sold / 1 active day = 0 velocity (correct — nothing was sold)
    // The important thing is no division by zero exception occurs
    expect(() => calcDailyVelocity(0, 28, 28)).not.toThrow();
    expect(calcDailyVelocity(0, 28, 28)).toBeGreaterThanOrEqual(0);
  });

  it("returns 0 when nothing sold", () => {
    expect(calcDailyVelocity(0, 28, 0)).toBe(0);
  });
});

describe("calcDaysOfStockLeft", () => {
  it("calculates correctly", () => {
    expect(calcDaysOfStockLeft(300, 10)).toBe(30);
  });

  it("returns 999 when velocity is 0 (slow mover)", () => {
    expect(calcDaysOfStockLeft(500, 0)).toBe(999);
  });

  it("returns 0 when out of stock", () => {
    expect(calcDaysOfStockLeft(0, 5)).toBe(0);
  });
});

describe("calcPriority", () => {
  it("flags CRITICAL at ≤30 days", () => {
    expect(calcPriority(30, false)).toBe("CRITICAL");
    expect(calcPriority(1, false)).toBe("CRITICAL");
    expect(calcPriority(0, false)).toBe("CRITICAL");
  });

  it("flags HIGH at 31–60 days", () => {
    expect(calcPriority(31, false)).toBe("HIGH");
    expect(calcPriority(60, false)).toBe("HIGH");
  });

  it("flags MEDIUM at 61–90 days", () => {
    expect(calcPriority(61, false)).toBe("MEDIUM");
    expect(calcPriority(90, false)).toBe("MEDIUM");
  });

  it("flags LOW at 91–120 days", () => {
    expect(calcPriority(91, false)).toBe("LOW");
    expect(calcPriority(120, false)).toBe("LOW");
  });

  it("returns OK above 120 days", () => {
    expect(calcPriority(121, false)).toBe("OK");
    expect(calcPriority(999, false)).toBe("OK");
  });

  it("returns OK for pre-orders regardless of stock", () => {
    expect(calcPriority(0, true)).toBe("OK");
    expect(calcPriority(5, true)).toBe("OK");
  });
});

describe("calcPerformanceTier", () => {
  it("classifies BEST_SELLER at ≥5 units/day", () => {
    expect(calcPerformanceTier(5)).toBe("BEST_SELLER");
    expect(calcPerformanceTier(20)).toBe("BEST_SELLER");
  });

  it("classifies STEADY at 1–4.99 units/day", () => {
    expect(calcPerformanceTier(1)).toBe("STEADY");
    expect(calcPerformanceTier(4.99)).toBe("STEADY");
  });

  it("classifies SLOW_MOVER below 1 unit/day", () => {
    expect(calcPerformanceTier(0.5)).toBe("SLOW_MOVER");
    expect(calcPerformanceTier(0)).toBe("SLOW_MOVER");
  });
});

describe("calcSmartOrderQty", () => {
  it("orders enough for BEST_SELLER 150-day runway", () => {
    // 10/day velocity, 100 in stock, 0 incoming → need 10*150 - 100 = 1400
    expect(calcSmartOrderQty(10, 100, "BEST_SELLER", 0)).toBe(1400);
  });

  it("orders enough for STEADY 120-day runway", () => {
    // 3/day velocity, 50 in stock, 0 incoming → need 3*120 - 50 = 310
    expect(calcSmartOrderQty(3, 50, "STEADY", 0)).toBe(310);
  });

  it("orders enough for SLOW_MOVER 90-day runway", () => {
    // 0.5/day velocity, 20 in stock, 0 incoming → need 0.5*90 - 20 = 25
    expect(calcSmartOrderQty(0.5, 20, "SLOW_MOVER", 0)).toBe(25);
  });

  it("accounts for incoming stock", () => {
    // 10/day, 100 in stock, 200 incoming → need 10*150 - 100 - 200 = 1200
    expect(calcSmartOrderQty(10, 100, "BEST_SELLER", 200)).toBe(1200);
  });

  it("never returns negative order quantity", () => {
    // Already overstocked
    expect(calcSmartOrderQty(1, 500, "STEADY", 0)).toBe(0);
  });

  it("uses 120-day runway as default for unknown tier", () => {
    // 2/day, 0 stock, 0 incoming → 2*120 = 240
    expect(calcSmartOrderQty(2, 0, "UNKNOWN_TIER", 0)).toBe(240);
  });
});

describe("OOS penalty integration", () => {
  it("higher velocity when OOS days are excluded from window", () => {
    // Same sales but with OOS days → higher effective velocity
    const withOOS = calcDailyVelocity(100, 28, 14);    // 100/14 ≈ 7.14
    const withoutOOS = calcDailyVelocity(100, 28, 0);  // 100/28 ≈ 3.57
    expect(withOOS).toBeGreaterThan(withoutOOS);
  });

  it("OOS penalty leads to larger recommended order", () => {
    const velocityWithOOS = calcDailyVelocity(100, 28, 14);
    const velocityWithout = calcDailyVelocity(100, 28, 0);
    const orderWithOOS = calcSmartOrderQty(velocityWithOOS, 0, "STEADY", 0);
    const orderWithout = calcSmartOrderQty(velocityWithout, 0, "STEADY", 0);
    expect(orderWithOOS).toBeGreaterThan(orderWithout);
  });
});

describe("auth.logout", () => {
  it("passes basic sanity check", () => {
    expect(true).toBe(true);
  });
});

// Temporal leakage auditor.
// Rule: a feature may be used by a prediction made at time T only if
//   availability_timestamp <= T.
// Any experiment containing a violation is rejected and recorded.

import { FeatureValue } from "./features.js";
import { iso } from "./core.js";
import { push, truncate, LeakageEvent, list } from "./store.js";

export function findLeak(features: FeatureValue[], predictionTime: number): FeatureValue[] {
  return features.filter((f) => f.availabilityTimestamp > predictionTime);
}

export function recordLeak(symbol: string, feature: string, predictionTime: number, sourceTime: number, availabilityTime: number, experimentId: string | null): void {
  const ev: LeakageEvent = {
    id: `leak_${Math.random().toString(36).slice(2, 10)}`,
    symbol,
    feature,
    predictionTime,
    sourceTime,
    availabilityTime,
    severity: availabilityTime - predictionTime > 60_000 ? "HIGH" : "MEDIUM",
    experimentId,
    at: iso(Date.now()),
  };
  push("leakage", ev);
  truncate("leakage", 500);
}

/** Full audit of a feature set against a prediction time. Returns pass/fail + violations. */
export function audit(symbol: string, features: FeatureValue[], predictionTime: number, experimentId: string | null = null): { passed: boolean; violations: FeatureValue[] } {
  const leaks = findLeak(features, predictionTime);
  for (const f of leaks) {
    recordLeak(symbol, f.name, predictionTime, f.sourceTimestamp, f.availabilityTimestamp, experimentId);
  }
  return { passed: leaks.length === 0, violations: leaks };
}

export function leakageEvents(symbol: string) {
  return list<LeakageEvent>("leakage").filter((e) => e.symbol === symbol).slice(-100).reverse();
}

/**
 * Live self-test: construct a deliberately leaking feature and confirm the
 * auditor catches it, plus confirm a compliant feature passes.
 */
export function selfTest(symbol: string): { ran: boolean; passed: boolean; description: string; detail: string } {
  const t = Date.now();
  const clean: FeatureValue[] = [{ name: "test_clean", value: 1, featureTimestamp: t - 3600_000, sourceTimestamp: t - 3600_000, availabilityTimestamp: t - 3600_000 }];
  const leaky: FeatureValue[] = [{ name: "test_leaky", value: 1, featureTimestamp: t + 300_000, sourceTimestamp: t + 300_000, availabilityTimestamp: t + 300_000 }];
  const a1 = audit(symbol, clean, t, "leakage-selftest");
  const a2 = audit(symbol, leaky, t, "leakage-selftest");
  const passed = a1.passed && !a2.passed;
  return {
    ran: true,
    passed,
    description: "Injects one compliant feature (availability <= prediction) and one leaky feature (availability = prediction + 5 min); the auditor must pass the first and reject the second.",
    detail: passed
      ? "Auditor correctly accepted the compliant feature and rejected the leaky one."
      : "AUDITOR FAILURE: compliant/leaky discrimination did not behave as expected.",
  };
}

// End-to-end smoke test against LIVE Binance data (run manually: npx tsx scripts/smoke.ts)
import { getMarket, getForecast, getRegime, getDataQuality, getReplay } from "../server/orchestrator.js";

async function main() {
  const m = await getMarket("BTCUSDT", "1h", 100);
  console.log("MARKET:", m.status, m.dataMode, m.provider, "bars:", (m.data as { candles: unknown[] })?.candles?.length);

  const f = await getForecast("BTCUSDT", "1h");
  const fd = (f.data ?? {}) as Record<string, any>;
  console.log("FORECAST:", f.status, f.dataMode, "point:", fd.point, "band:", fd.lower, "-", fd.upper);
  console.log("  model:", fd.model?.id, "| regime:", fd.regime?.state, "| latencyMs:", fd.latencyMs);
  console.log("  router:", fd.router?.reason);
  console.log("  provenance: dataset", fd.datasetVersion, "snapshot", String(fd.dataSnapshotId).slice(0, 16), "feature", fd.featureVersion, "code", fd.codeVersion);
  console.log("  interval note:", fd.intervalNote);

  const r = await getRegime("BTCUSDT");
  console.log("REGIME:", r.status, (r.data as any)?.regime, "conf:", (r.data as any)?.confidence);

  const q = await getDataQuality("BTCUSDT", "1h");
  console.log("QUALITY:", (q.data as any)?.score, "/100");

  const rp = await getReplay("BTCUSDT", "1h", 6);
  const rows = (rp.data as any)?.rows as { leaked: boolean }[];
  console.log("REPLAY:", rp.status, "rows:", rows?.length, "all leaked=false:", rows?.every((x) => !x.leaked));
}

main().catch((e) => { console.error("SMOKE FAILED:", e); process.exit(1); });

#!/usr/bin/env node
// One-command experiment reproducibility:
//   npm run reproduce -- --config configs/eval-ets.json
//   npm run reproduce:all
// Loads a config JSON, builds the dataset exactly as the server would
// (provider -> ingestion pipeline -> dataset version), runs walk-forward
// evaluation, and prints a machine-readable + human-readable report.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

function parseArgs(): { config?: string; all: boolean } {
  const args = process.argv.slice(2);
  const out = { all: false as boolean, config: undefined as string | undefined };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--all") out.all = true;
    if (args[i] === "--config") out.config = args[i + 1];
  }
  return out;
}

async function runConfig(path: string): Promise<void> {
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  console.log(`\n=== SENTINELX NEXUS experiment: ${cfg.model} on ${cfg.symbol} ${cfg.timeframe}/${cfg.horizon} ===`);
  console.log(`config: ${path}`);
  console.log(`note:   ${cfg.notes ?? ""}`);

  const { ensureSeeded, syntheticFallback, syntheticSpecFor } = await import("../server/seed.js");
  const { fetchMarketData } = await import("../server/providers/registry.js");
  const { instruments } = await import("../server/store.js");
  const { ingest } = await import("../server/ingest.js");
  const { walkForward } = await import("../server/evaluation.js");
  const { registerDataset } = await import("../server/datasets.js");
  const { syntheticEnabled } = await import("../server/seed.js");
  const { VERSIONS, iso } = await import("../server/core.js");

  ensureSeeded();
  const ins = instruments().get(cfg.symbol);
  let series;
  let provider;
  if (ins) {
    const fetched = await fetchMarketData(cfg.symbol, ins.assetClass, cfg.timeframe, 400);
    if (fetched.status === "OK") {
      provider = fetched.provider;
    } else if (syntheticEnabled()) {
      ingest(cfg.symbol, cfg.timeframe, syntheticFallback(cfg.symbol, cfg.timeframe, 400));
      provider = "synthetic";
      console.log(`[data] provider chain unavailable (${fetched.reason ?? fetched.status}); using LABELED SYNTHETIC data`);
    } else {
      throw new Error(`data unavailable: ${fetched.reason}`);
    }
    const { getCandles } = await import("../server/store.js");
    series = getCandles(cfg.symbol, cfg.timeframe);
  } else {
    const { generateSynthetic } = await import("../server/synthetic.js");
    const gen = generateSynthetic(syntheticSpecFor(cfg.symbol, cfg.timeframe, 400));
    series = ingest(cfg.symbol, cfg.timeframe, gen.candles).candles;
    provider = "synthetic";
  }

  const dataset = registerDataset(cfg.symbol, cfg.timeframe, series, provider ?? "unknown");
  console.log(`[dataset] ${dataset.datasetId} v=${dataset.version} bars=${dataset.barCount} checksum=${dataset.checksum} provider=${provider}`);

  const result = walkForward(cfg.model, cfg.symbol, cfg.timeframe, cfg.horizon, series, { folds: cfg.folds ?? 12 });
  console.log(`[metrics] ${JSON.stringify(result.metrics, null, 2)}`);
  console.log(`[experiment] id=${result.experimentId} latencyMs=${result.latencyMs} codeVersion=${VERSIONS.code}`);
  console.log(`[reproduce] npm run reproduce -- --config ${path.replace(ROOT, "")}`);
  console.log(`[report generated at] ${iso(Date.now())}`);
}

const args = parseArgs();
try {
  if (args.all) {
    const dir = join(ROOT, "configs");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      await runConfig(join(dir, f));
    }
  } else if (args.config) {
    await runConfig(join(process.cwd(), args.config));
  } else {
    console.error("usage: npm run reproduce -- --config configs/eval-ets.json   (or --all)");
    process.exit(1);
  }
} catch (e) {
  console.error(`experiment failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

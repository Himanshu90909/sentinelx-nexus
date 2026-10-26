// SENTINELX NEXUS API core - route table + shared handler logic.
// Thin Vercel functions in /api import `serve()` with an explicit route key.
// (Vercel's api-dir router does not reliably parse catch-all filenames, so each
// route gets its own function file; the logic lives here, once.)
// Every handler is latency-timed and every failure returns an explicit status.
//
// Security: provider API keys are read ONLY from server-side env here.
// This function never logs or returns secrets. Admin routes require
// `Authorization: Bearer $ADMIN_TOKEN`.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { AssetClass, ApiResult, iso } from "./core.js";
import {
  getHealth, getInstruments, adminAddInstrument, getMarket, getFeatures, getForecast,
  getForecastHistory, getMatrix, getRegime, getDrift, getDataQuality, getLeakageReport,
  getEvaluation, getModels, getExperiments, getDatasets, getReplay, metricsLatency,
  adminRetrain,
} from "./orchestrator.js";
import { providerSnapshot } from "./providers/registry.js";
import { recordLatency } from "./metrics.js";
import { generateSynthetic } from "./synthetic.js";
import { ingest } from "./ingest.js";
import { MODELS } from "./models.js";
import { ARCHITECTURE } from "./architecture.js";

type Handler = (req: VercelRequest, params: Record<string, string>) => Promise<unknown>;
interface Route { method: "GET" | "POST"; segs: string[]; handler: Handler; admin: boolean }

function route(method: "GET" | "POST", path: string, handler: Handler, admin = false): Route {
  return { method, segs: path.split("/"), handler, admin };
}

export const ROUTES: Route[] = [
  route("GET", "health", async () => getHealth()),
  route("GET", "architecture", async () => ({ status: "OK" as const, data: ARCHITECTURE, generatedAt: iso(Date.now()) })),
  route("GET", "providers", async () => ({ status: "OK" as const, data: { providers: providerSnapshot() }, generatedAt: iso(Date.now()) })),
  route("GET", "instruments", async () => getInstruments()),
  route("POST", "instruments", async (req) => {
    const body = readBody(req);
    if (!body.symbol) return bad("BAD_REQUEST", "symbol required");
    const ac = (body.assetClass ?? "EQUITY") as AssetClass;
    if (!["EQUITY", "ETF", "INDEX", "CRYPTO", "FOREX", "COMMODITY", "MACRO"].includes(ac)) return bad("BAD_REQUEST", "invalid assetClass");
    return adminAddInstrument(String(body.symbol), ac, body.market ? String(body.market) : undefined);
  }, true),
  route("GET", "market/:symbol", async (req, p) => getMarket(p.symbol, q(req, "timeframe") ?? "1h", clampInt(q(req, "bars"), 50, 1000, 300))),
  route("GET", "features/:symbol", async (req, p) => getFeatures(p.symbol, q(req, "timeframe") ?? "1h")),
  route("GET", "forecast/:symbol", async (req, p) => {
    if (q(req, "view") === "history") return getForecastHistory(p.symbol, q(req, "horizon") ?? null);
    return getForecast(p.symbol, q(req, "horizon") ?? "1h");
  }),
  route("GET", "matrix", async () => getMatrix()),
  route("GET", "regime/:symbol", async (_req, p) => getRegime(p.symbol)),
  route("GET", "drift/:symbol", async (_req, p) => getDrift(p.symbol)),
  route("GET", "data-quality/:symbol", async (req, p) => getDataQuality(p.symbol, q(req, "timeframe") ?? "1h")),
  route("GET", "leakage/:symbol", async (_req, p) => getLeakageReport(p.symbol)),
  route("GET", "models", async () => getModels()),
  route("GET", "evaluation/:model", async (req, p) => getEvaluation(p.model, q(req, "symbol") ?? "BTCUSDT", q(req, "horizon") ?? "1h", q(req, "timeframe"))),
  route("GET", "datasets", async (req) => getDatasets(q(req, "symbol"))),
  route("GET", "experiments", async () => getExperiments()),
  route("GET", "replay/:symbol", async (req, p) => getReplay(p.symbol, q(req, "horizon") ?? "1h", clampInt(q(req, "steps"), 1, 24, 12))),
  route("GET", "metrics/latency", async () => metricsLatency()),
  route("POST", "synthetic", async (req) => {
    const body = readBody(req);
    const spec = {
      symbol: String(body.symbol ?? "SYN1").toUpperCase(),
      timeframe: (q(req, "timeframe") ?? "1h") as "1h",
      bars: clampInt(String(body.bars ?? q(req, "bars") ?? 500), 60, 2000, 500),
      seed: body.seed !== undefined ? Number(body.seed) : 42,
      regimeShifts: 3, gaps: 2, outliers: 3,
      structuralBreak: { atBarPct: 0.6, levelShiftPct: 5 },
    };
    const { candles, injected } = generateSynthetic(spec);
    const res = ingest(spec.symbol, spec.timeframe, candles);
    return { status: "OK" as const, dataMode: "SYNTHETIC" as const, data: { symbol: spec.symbol, timeframe: spec.timeframe, injected, barCount: res.candles.length, rejected: res.rejected }, generatedAt: iso(Date.now()) };
  }),
  route("POST", "admin/retrain", async (req) => {
    const body = readBody(req);
    if (!body.symbol) return bad("BAD_REQUEST", "symbol required");
    return adminRetrain(String(body.symbol), String(body.horizon ?? "1h"));
  }, true),
  route("POST", "admin/promote", async (req) => {
    const body = readBody(req);
    if (!body.model) return bad("BAD_REQUEST", "model required");
    const meta = MODELS.find((m) => m.id === body.model);
    if (!meta) return bad("BAD_REQUEST", "unknown model");
    if (!body.validationExperimentId) return bad("LEAKAGE_DETECTED", "promotion requires a validation experiment id with walk-forward evidence; refusing to promote without validation");
    return { status: "OK" as const, data: { promoted: body.model, from: meta.status, to: "CANDIDATE", validationExperimentId: body.validationExperimentId, at: iso(Date.now()) }, generatedAt: iso(Date.now()) };
  }, true),
];

function readBody(req: VercelRequest): Record<string, string> {
  if (typeof req.body === "object" && req.body) return req.body as Record<string, string>;
  try { return JSON.parse(req.body ?? "{}"); } catch { return {}; }
}
function bad(status: string, reason: string): ApiResult<never> {
  return { status: status as ApiResult<never>["status"], reason, generatedAt: iso(Date.now()) };
}
function q(req: VercelRequest, key: string): string | undefined {
  const url = new URL(req.url ?? "/", "https://x");
  return url.searchParams.get(key) ?? undefined;
}
function clampInt(v: string | undefined, lo: number, hi: number, dflt: number): number {
  const n = parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

function match(route: Route, segs: string[]): Record<string, string> | null {
  if (segs.length !== route.segs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < segs.length; i++) {
    const want = route.segs[i];
    if (want.startsWith(":")) params[want.slice(1)] = decodeURIComponent(segs[i]);
    else if (want !== segs[i]) return null;
  }
  return params;
}

/** Dispatch one explicit route key, e.g. "GET market/:symbol". */
export async function serve(req: VercelRequest, res: VercelResponse, key: string, params: Record<string, string> = {}): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const path = key.split(" ")[1] ?? key;
  const t0 = Date.now();
  try {
    const [method, pattern] = key.split(" ");
    const r = ROUTES.find((r) => r.method === method && r.segs.join("/") === pattern);
    if (!r) {
      res.status(404).json(bad("BAD_REQUEST", `no route: ${key}`));
      return;
    }
    if (r.admin) {
      const expected = process.env.ADMIN_TOKEN;
      if (!expected) { res.status(503).json(bad("UNAUTHORIZED", "ADMIN_TOKEN not configured; admin routes are disabled")); return; }
      if (req.headers.authorization !== `Bearer ${expected}`) { res.status(401).json(bad("UNAUTHORIZED", "admin token required")); return; }
    }
    const result = await r.handler(req, params);
    const st = result && typeof result === "object" && "status" in (result as Record<string, unknown>) && (result as { status: string }).status !== "OK" ? statusHttp((result as { status: string }).status) : 200;
    res.status(st).json(result);
  } catch (e) {
    res.status(500).json(bad("DATA_UNAVAILABLE", `internal error: ${e instanceof Error ? e.message : String(e)}`));
  } finally {
    recordLatency(`${key.split(" ")[0]} /api/${path}`, Date.now() - t0);
  }
}

/** Match a real request path (used by the local dev server only). */
export function matchPath(method: string, pathname: string): { key: string; params: Record<string, string> } | null {
  const segs = pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "").split("/").filter(Boolean);
  for (const r of ROUTES) {
    if (r.method !== method) continue;
    const m = match(r, segs);
    if (m) return { key: `${r.method} ${r.segs.join("/")}`, params: m };
  }
  return null;
}

function statusHttp(s: string): number {
  if (s === "UNAUTHORIZED") return 401;
  if (s === "BAD_REQUEST") return 400;
  if (s === "LEAKAGE_DETECTED") return 422;
  return 503;
}

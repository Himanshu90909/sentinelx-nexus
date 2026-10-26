// API layer tests: exercises the actual serverless handler with mock
// req/res objects, including admin auth and failure statuses.
import { describe, expect, it } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type Json = Record<string, unknown>;
interface MockRes {
  code: number;
  body: Json | null;
  headers: Record<string, string>;
  setHeader(k: string, v: string): void;
  status(c: number): MockRes;
  json(b: Json): void;
}

function mockRes(): MockRes {
  const res: MockRes = {
    code: 0,
    body: null,
    headers: {},
    setHeader(k: string, v: string) { this.headers[k] = v; },
    status(c: number) { this.code = c; return this; },
    json(b: Json) { this.body = b; },
  };
  return res;
}

async function call(method: string, path: string, opts: { auth?: string; body?: unknown } = {}): Promise<{ code: number; body: Json | null }> {
  const mod = await import("../server/http.js");
  const url = new URL(`https://sentinelx.test/api/${path}`);
  const m = mod.matchPath(method, url.pathname);
  const req = {
    method,
    url: url.pathname + url.search,
    headers: opts.auth ? { authorization: opts.auth } : {},
    body: opts.body ?? undefined,
  } as unknown as VercelRequest;
  const res = mockRes();
  if (!m) {
    await mod.serve(req, res as unknown as VercelResponse, `${method} __missing__`, {});
    return { code: res.code, body: res.body };
  }
  await mod.serve(req, res as unknown as VercelResponse, m.key, m.params);
  return { code: res.code, body: res.body };
}

describe("API surface", () => {
  it("GET /api/health reports the service honestly", async () => {
    const { code, body } = await call("GET", "health");
    expect(code).toBe(200);
    expect(body!.status).toBe("OK");
    expect((body!.data as { service: string }).service).toBe("sentinelx-nexus");
  });

  it("GET /api/providers lists configured/unconfigured providers with required env keys", async () => {
    const { body } = await call("GET", "providers");
    const providers = (body!.data as { providers: { name: string; configured: boolean; requiredEnv: string[] }[] }).providers;
    expect(providers.length).toBeGreaterThanOrEqual(9);
    const binance = providers.find((p) => p.name === "binance");
    expect(binance!.requiredEnv).toEqual([]);
    const fred = providers.find((p) => p.name === "fred");
    expect(fred!.requiredEnv).toContain("FRED_API_KEY");
  });

  it("unknown routes 404 with an explicit status", async () => {
    const { code, body } = await call("GET", "no-such-route");
    expect(code).toBe(404);
    expect(body!.status).toBe("BAD_REQUEST");
  });

  it("market data for an equity is labeled SYNTHETIC when no provider key exists", async () => {
    const { body } = await call("GET", "market/AAPL?timeframe=1h&bars=120");
    expect(body!.status).toBe("OK");
    expect(body!.dataMode).toBe("SYNTHETIC");
  });

  it("forecasts carry provenance (snapshot, dataset, feature and code versions)", async () => {
    const { body } = await call("GET", "forecast/AAPL?horizon=1h");
    expect(body!.status).toBe("OK");
    const d = body!.data as Record<string, unknown>;
    expect(String(d.dataSnapshotId)).toMatch(/^snap_/);
    expect(d.datasetVersion).toBeTruthy();
    expect(d.featureVersion).toBe("f1.0");
    expect(d.latencyMs).toBeTypeOf("number");
  });

  it("admin routes are locked when ADMIN_TOKEN is unset, and reject bad tokens", async () => {
    const unset = await call("POST", "admin/retrain", { body: { symbol: "AAPL" } });
    expect(unset.code).toBe(503);
    process.env.ADMIN_TOKEN = "test-admin-token";
    const wrong = await call("POST", "admin/retrain", { auth: "Bearer nope", body: { symbol: "AAPL" } });
    expect(wrong.code).toBe(401);
    const badBody = await call("POST", "admin/retrain", { auth: "Bearer test-admin-token", body: {} });
    expect(badBody.body!.status).toBe("BAD_REQUEST");
    delete process.env.ADMIN_TOKEN;
  });

  it("promotion without validation evidence is refused (no silent model swaps)", async () => {
    process.env.ADMIN_TOKEN = "test-admin-token";
    const res = await call("POST", "admin/promote", { auth: "Bearer test-admin-token", body: { model: "ets" } });
    expect(res.body!.status).toBe("LEAKAGE_DETECTED");
    expect(String(res.body!.reason)).toMatch(/validation/);
    delete process.env.ADMIN_TOKEN;
  });

  it("latency metrics are recorded per endpoint", async () => {
    const { body } = await call("GET", "metrics/latency");
    const samples = (body!.data as { samples: { endpoint: string }[] }).samples;
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.some((s) => s.endpoint.includes("/api/"))).toBe(true);
  });
});

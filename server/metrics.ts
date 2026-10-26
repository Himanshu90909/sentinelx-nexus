// Server-side latency measurement. Every API handler is wrapped and timed.
// Values shown in the Performance Lab are measured, never estimated.

const globalRef = globalThis as unknown as { __SN_LAT?: Map<string, number[]> };
function buf(): Map<string, number[]> {
  globalRef.__SN_LAT ??= new Map();
  return globalRef.__SN_LAT;
}

export function recordLatency(endpoint: string, ms: number): void {
  const arr = buf().get(endpoint) ?? [];
  arr.push(ms);
  if (arr.length > 200) arr.shift();
  buf().set(endpoint, arr);
}

export function latencySnapshot() {
  const out: { endpoint: string; p50Ms: number; p95Ms: number; count: number; measuredAt: string }[] = [];
  for (const [endpoint, samples] of buf()) {
    const s = [...samples].sort((a, b) => a - b);
    out.push({
      endpoint,
      p50Ms: s[Math.floor(s.length * 0.5)] ?? 0,
      p95Ms: s[Math.floor(s.length * 0.95)] ?? 0,
      count: s.length,
      measuredAt: new Date().toISOString(),
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** Wrap a handler with latency measurement. */
export function timed<T extends (req: unknown, res: unknown) => Promise<unknown>>(endpoint: string, handler: T): T {
  return (async (req: unknown, res: unknown) => {
    const t0 = Date.now();
    try {
      return await handler(req, res);
    } finally {
      recordLatency(endpoint, Date.now() - t0);
    }
  }) as T;
}

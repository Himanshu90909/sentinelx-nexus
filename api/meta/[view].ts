import type { VercelRequest, VercelResponse } from "@vercel/node";
import { serve } from "../../server/http.js";

// Consolidated read-only + synthetic endpoints (Hobby plan caps functions per
// deployment). Public URLs like /api/health are rewritten to /api/meta/health
// in vercel.json; the public API surface is unchanged.
const MAP: Record<string, string> = {
  health: "GET health",
  architecture: "GET architecture",
  providers: "GET providers",
  models: "GET models",
  matrix: "GET matrix",
  datasets: "GET datasets",
  experiments: "GET experiments",
  latency: "GET metrics/latency",
  synthetic: "POST synthetic",
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  const view = String(req.query.view ?? "");
  const key = MAP[view];
  if (!key) {
    return serve(req, res, "GET __missing__", {});
  }
  return serve(req, res, key, {});
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { serve } from "../../server/http.js";

// Consolidated admin endpoints (admin-gated inside server/http.ts):
// POST /api/admin/retrain, POST /api/admin/promote
export default function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action ?? "");
  const key = req.method === "POST" ? `POST admin/${action}` : `GET admin/${action}`;
  if (action !== "retrain" && action !== "promote") {
    return serve(req, res, "GET __missing__", {});
  }
  return serve(req, res, key, {});
}

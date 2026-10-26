import type { VercelRequest, VercelResponse } from "@vercel/node";
import { serve } from "../server/http.js";

// GET /api/instruments  -> dynamic instrument universe
// POST /api/instruments -> admin-only: add a symbol at runtime
export default function handler(req: VercelRequest, res: VercelResponse) {
  const key = req.method === "POST" ? "POST instruments" : "GET instruments";
  return serve(req, res, key, {});
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { serve } from "../server/http.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  return serve(req, res, "GET providers", {});
}

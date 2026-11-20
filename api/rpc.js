// Vercel serverless function: the single, shared backend for all three apps.
import { handle } from './_lib/handler.js';

export default async function rpc(req, res) {
  return handle(req, res);
}

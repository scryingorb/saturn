import { env } from "cloudflare:workers";
import { handleAffirmation } from "../../../server/affirmation";

export function POST(request: Request) {
  return handleAffirmation(request, env);
}

export function OPTIONS(request: Request) {
  return handleAffirmation(request, env);
}

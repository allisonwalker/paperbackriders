import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Handler = ReturnType<typeof toNextJsHandler>;

let handler: Handler | undefined;

function authHandler(): Handler {
  handler ??= toNextJsHandler(getAuth());
  return handler;
}

export function GET(request: Request) {
  return authHandler().GET(request);
}

export function POST(request: Request) {
  return authHandler().POST(request);
}

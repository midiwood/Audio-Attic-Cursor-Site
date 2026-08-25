import { auth, ensureBootstrapAdmin } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handler = toNextJsHandler(auth);

async function withBootstrap(req: Request, method: "GET" | "POST") {
  await ensureBootstrapAdmin();
  return method === "GET" ? handler.GET(req) : handler.POST(req);
}

export async function GET(req: Request) {
  return withBootstrap(req, "GET");
}

export async function POST(req: Request) {
  return withBootstrap(req, "POST");
}

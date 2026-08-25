import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { auth } from "@/lib/auth";
import { PENDING_APPROVAL_REASON } from "@/lib/pending-approval";

export const runtime = "nodejs";

async function setCredentialPassword(userId: string, password: string) {
  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(password);
  const accounts = await ctx.internalAdapter.findAccounts(userId);
  const credential = accounts.find((account) => account.providerId === "credential");
  if (credential) {
    await ctx.internalAdapter.updatePassword(userId, hashed);
  } else {
    await ctx.internalAdapter.linkAccount({
      userId,
      providerId: "credential",
      accountId: userId,
      password: hashed,
    });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }

  const existing = db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .get();
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists" },
      { status: 409 },
    );
  }

  try {
    const ctx = await auth.$context;
    const created = await ctx.internalAdapter.createUser({
      email,
      name,
      emailVerified: false,
      role: "subscriber",
      banned: true,
      banReason: PENDING_APPROVAL_REASON,
    });
    if (!created) {
      return NextResponse.json({ error: "Could not create account" }, { status: 500 });
    }
    await setCredentialPassword(created.id, password);

    // Ensure pending gate even if adapter ignored banned flags.
    db.update(user)
      .set({ banned: true, banReason: PENDING_APPROVAL_REASON })
      .where(eq(user.id, created.id))
      .run();

    return NextResponse.json({
      ok: true,
      pending: true,
      message: "Account created. An admin must approve before you can sign in.",
    });
  } catch (err) {
    console.error("[signup]", err);
    return NextResponse.json({ error: "Could not create account" }, { status: 500 });
  }
}

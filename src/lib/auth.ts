import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin } from "better-auth/plugins";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import * as authSchema from "@/db/auth-schema";
import { ac, admin, editor, subscriber, type AppRole } from "@/lib/auth-permissions";

function authSecret() {
  return process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET || "dev-secret";
}

function authBaseUrl() {
  return process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function authTrustedOrigins(): string[] {
  const base = authBaseUrl().replace(/\/$/, "");
  const extras = String(process.env.BETTER_AUTH_TRUSTED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return [...new Set([base, ...extras].filter(Boolean))];
}

export const auth = betterAuth({
  appName: "Audio Attic",
  secret: authSecret(),
  baseURL: authBaseUrl(),
  trustedOrigins: authTrustedOrigins(),
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      ...authSchema,
      user: authSchema.user,
      session: authSchema.session,
      account: authSchema.account,
      verification: authSchema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      proRelationNumber: {
        type: "string",
        required: false,
        input: true,
      },
      proIpiBaseNumber: {
        type: "string",
        required: false,
        input: true,
      },
      proPaIpiNameNumber: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  plugins: [
    adminPlugin({
      ac,
      roles: {
        admin,
        editor,
        subscriber,
      },
      defaultRole: "subscriber",
      adminRoles: ["admin"],
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

let bootstrapPromise: Promise<void> | null = null;

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

/** Create the first admin from ADMIN_EMAIL + ADMIN_PASSWORD when the user table is empty. */
export function ensureBootstrapAdmin(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
      const password = process.env.ADMIN_PASSWORD || "";
      if (!email || !password) return;

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(authSchema.user);
      const ctx = await auth.$context;

      if (Number(count) === 0) {
        const user = await ctx.internalAdapter.createUser({
          email,
          name: "Admin",
          emailVerified: true,
          role: "admin",
        });
        if (!user) throw new Error("Failed to bootstrap admin user");
        await setCredentialPassword(user.id, password);
      }
    })().catch((err) => {
      bootstrapPromise = null;
      console.error("[auth] bootstrap admin failed", err);
      throw err;
    });
  }
  return bootstrapPromise;
}

/** Per-request memo — layout + page share one session lookup. */
export const getSession = cache(async () => {
  await ensureBootstrapAdmin();
  return auth.api.getSession({ headers: await headers() });
});

export async function requireSession(nextPath = "/") {
  const session = await getSession();
  if (!session) {
    redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`);
  }
  return session;
}

export function getUserRole(session: Session | null | undefined): AppRole | null {
  const role = session?.user?.role;
  if (role === "admin" || role === "editor" || role === "subscriber") return role;
  if (typeof role === "string" && role.split(",").includes("admin")) return "admin";
  if (typeof role === "string" && role.split(",").includes("editor")) return "editor";
  if (typeof role === "string" && role.split(",").includes("subscriber")) return "subscriber";
  return null;
}

export function isSiteAdmin(session: Session | null | undefined): boolean {
  return getUserRole(session) === "admin";
}

/** Admin or editor — can upload, edit tracks, see full catalog metadata. */
export function canManageCatalog(session: Session | null | undefined): boolean {
  const role = getUserRole(session);
  return role === "admin" || role === "editor";
}

export function isSubscriber(session: Session | null | undefined): boolean {
  return getUserRole(session) === "subscriber";
}

/** Any signed-in user (admin, editor, or subscriber). */
export async function isAuthenticated(): Promise<boolean> {
  return Boolean(await getSession());
}

/** @deprecated Prefer isAuthenticated / canManageCatalog — kept as alias during migration. */
export async function isAdminAuthenticated(): Promise<boolean> {
  return isAuthenticated();
}

/** Require admin or editor (not subscriber). */
export async function requireCatalogStaff(nextPath = "/") {
  const session = await requireSession(nextPath);
  if (!canManageCatalog(session)) {
    redirect("/");
  }
  return session;
}

/** API: signed-in session or null. */
export async function getApiSession() {
  return getSession();
}

/** API: admin/editor only. Returns status code when forbidden. */
export async function getCatalogStaffSession(): Promise<
  | { ok: true; session: NonNullable<Awaited<ReturnType<typeof getSession>>> }
  | { ok: false; status: 401 | 403 }
> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401 };
  if (!canManageCatalog(session)) return { ok: false, status: 403 };
  return { ok: true, session };
}

export async function requireSiteAdmin(nextPath = "/admin/site") {
  const session = await requireSession(nextPath);
  if (!isSiteAdmin(session)) {
    redirect("/");
  }
  return session;
}

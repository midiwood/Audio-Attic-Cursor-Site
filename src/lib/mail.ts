/** Outbound email via Resend. Uses Admin settings, then env. */

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { getMailRuntimeConfig } from "@/lib/site-settings";

export type SendMailResult = {
  sent: boolean;
  inviteUrl?: string;
  error?: string;
};

function parseResendError(status: number, body: string): string {
  try {
    const json = JSON.parse(body) as { message?: string; name?: string };
    if (json.message) return json.message;
  } catch {
    /* ignore */
  }
  if (status === 401 || status === 403) return "Resend API key was rejected.";
  if (status === 422) {
    return "Resend rejected the from/to address. Verify your domain or use the email on your Resend account.";
  }
  return `Resend failed (${status}).`;
}

function siteOrigin(): string {
  return String(process.env["BETTER_AUTH_URL"] || "")
    .trim()
    .replace(/\/+$/, "");
}

async function sendResendEmail(input: {
  to: string[];
  subject: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { apiKey, from } = getMailRuntimeConfig();
  if (!apiKey) {
    return { ok: false, error: "Email isn’t configured yet (Admin → Email)." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[mail] Resend failed", res.status, body);
      return { ok: false, error: parseResendError(res.status, body) };
    }
    return { ok: true };
  } catch (err) {
    console.error("[mail] send failed", err);
    return { ok: false, error: "Could not reach Resend." };
  }
}

/** Active admin / editor emails (catalog staff who handle license deals). */
export function listCatalogStaffNotifyEmails(): string[] {
  const rows = db
    .select({ email: user.email, role: user.role, banned: user.banned })
    .from(user)
    .where(
      and(
        or(eq(user.banned, false), isNull(user.banned)),
        or(
          eq(user.role, "admin"),
          eq(user.role, "editor"),
          sql`instr(',' || coalesce(${user.role}, '') || ',', ',admin,') > 0`,
          sql`instr(',' || coalesce(${user.role}, '') || ',', ',editor,') > 0`,
        ),
      ),
    )
    .all();

  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const email = String(row.email || "")
      .trim()
      .toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export async function sendPlaylistInviteEmail(input: {
  to: string;
  playlistName: string;
  inviteUrl: string;
  ownerLabel?: string | null;
}): Promise<SendMailResult> {
  const { to, playlistName, inviteUrl, ownerLabel } = input;
  const fromWho = (ownerLabel || "Someone").trim() || "Someone";
  const subject = `${fromWho} shared a playlist with you on Audio Attic`;
  const text = [
    `${fromWho} shared “${playlistName}” with you.`,
    "",
    "Open the playlist (no account required):",
    inviteUrl,
    "",
    "If you already have an Audio Attic login with this email, you’ll also see it under Shared with you when signed in.",
  ].join("\n");

  const { apiKey } = getMailRuntimeConfig();
  if (!apiKey) {
    console.info(`[mail] Resend not configured — invite for ${to}: ${inviteUrl}`);
    return {
      sent: false,
      inviteUrl,
      error:
        "Email isn’t configured yet (Admin → Email). Copy the invite link below for now.",
    };
  }

  const result = await sendResendEmail({ to: [to], subject, text });
  if (!result.ok) {
    return {
      sent: false,
      inviteUrl,
      error: `${result.error} Copy the invite link below.`,
    };
  }
  return { sent: true, inviteUrl };
}

/** Notify catalog staff when a subscriber submits a license request. */
export async function sendLicenseRequestNotifyEmail(input: {
  trackId: string;
  trackTitle: string;
  requesterName: string;
  requesterEmail: string;
  scopeSummary: string;
  intendedUse: string;
}): Promise<SendMailResult> {
  const recipients = listCatalogStaffNotifyEmails();
  const origin = siteOrigin();
  const queueUrl = origin ? `${origin}/admin/licensing` : "/admin/licensing";
  const who =
    (input.requesterName || "").trim() ||
    (input.requesterEmail || "").trim() ||
    "A subscriber";
  const subject = `License request: ${input.trackTitle}`;
  const text = [
    `${who}${input.requesterEmail ? ` <${input.requesterEmail}>` : ""} requested a license.`,
    "",
    `Track: ${input.trackTitle} (${input.trackId})`,
    `Project: ${input.intendedUse || "—"}`,
    `Scope: ${input.scopeSummary || "—"}`,
    "",
    "Review in Audio Attic:",
    queueUrl,
  ].join("\n");

  if (!recipients.length) {
    console.info(`[mail] No admin/editor recipients for license request — ${subject}`);
    return { sent: false, error: "No admin or editor emails to notify." };
  }

  const { apiKey } = getMailRuntimeConfig();
  if (!apiKey) {
    console.info(
      `[mail] Resend not configured — license request for staff (${recipients.join(", ")}):\n${text}`,
    );
    return {
      sent: false,
      error: "Email isn’t configured yet (Admin → Email).",
    };
  }

  const result = await sendResendEmail({ to: recipients, subject, text });
  if (!result.ok) {
    console.error("[mail] license request notify failed", result.error);
    return { sent: false, error: result.error };
  }
  return { sent: true };
}

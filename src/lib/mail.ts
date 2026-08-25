/** Playlist invite emails via Resend. Uses Admin settings, then env. */

import { getMailRuntimeConfig } from "@/lib/site-settings";

export type SendMailResult = {
  sent: boolean;
  inviteUrl: string;
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

  const { apiKey, from } = getMailRuntimeConfig();

  if (!apiKey) {
    console.info(`[mail] Resend not configured — invite for ${to}: ${inviteUrl}`);
    return {
      sent: false,
      inviteUrl,
      error:
        "Email isn’t configured yet (Admin → Email). Copy the invite link below for now.",
    };
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
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[mail] Resend failed", res.status, body);
      return {
        sent: false,
        inviteUrl,
        error: `${parseResendError(res.status, body)} Copy the invite link below.`,
      };
    }
    return { sent: true, inviteUrl };
  } catch (err) {
    console.error("[mail] send failed", err);
    return {
      sent: false,
      inviteUrl,
      error: "Could not reach Resend — copy the invite link below.",
    };
  }
}

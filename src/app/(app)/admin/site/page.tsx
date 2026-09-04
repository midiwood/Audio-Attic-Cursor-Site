import Link from "next/link";
import { requireSiteAdmin } from "@/lib/auth";
import { countPendingLicenseRequests } from "@/lib/license-requests";
import { countPendingApprovals } from "@/lib/pending-approval-count";
import { countTracks, getTrackCount } from "@/lib/queries";
import {
  getAiRuntimeConfig,
  getMailRuntimeConfig,
  getPublisherRuntimeConfig,
  getSpacesRuntimeConfig,
  settingSource,
  SETTINGS,
} from "@/lib/site-settings";

export const dynamic = "force-dynamic";

function statusLabel(configured: boolean, source: "admin" | "env" | "none") {
  if (!configured) return "Not configured";
  if (source === "admin") return "Configured · Admin";
  if (source === "env") return "Configured · .env";
  return "Configured";
}

export default async function AdminSitePage() {
  await requireSiteAdmin("/admin/site");

  const ai = getAiRuntimeConfig();
  const spaces = getSpacesRuntimeConfig();
  const mail = getMailRuntimeConfig();
  const publisher = getPublisherRuntimeConfig();
  const pendingUsers = countPendingApprovals();
  const pendingLicenses = countPendingLicenseRequests();
  const aiReady = Boolean(ai.geminiApiKey);
  const spacesReady = Boolean(spaces.key && spaces.secret && spaces.bucket && spaces.region);
  const mailReady = Boolean(mail.apiKey);
  const publisherReady = Boolean(publisher.houseName);

  const trackTotal = getTrackCount();
  const partnerClear = countTracks({ license: "clear" });
  const library = countTracks({ license: "library" });
  const exclusive = countTracks({ license: "exclusive" });
  const hold = countTracks({ license: "hold" });
  const personal = countTracks({ license: "personal" });

  const cards = [
    {
      href: "/admin/users",
      title: "Users",
      description: "Add, remove, and set roles for people who use Audio Attic.",
      meta: null as string | null,
      badge: pendingUsers,
    },
    {
      href: "/admin/licensing",
      title: "Licensing",
      description: "Client license requests — accept to log a deal, decline, or archive.",
      meta: null as string | null,
      badge: pendingLicenses,
    },
    {
      href: "/admin/composers",
      title: "Composers",
      description: "Composer names and IPI numbers for SAMRO rights holders.",
      meta: null as string | null,
      badge: 0,
    },
    {
      href: "/admin/samro",
      title: "SAMRO",
      description: "Notification of Works forms — prepare, download, mark complete.",
      meta: null as string | null,
      badge: 0,
    },
    {
      href: "/admin/settings/publisher",
      title: "Publisher / PRO",
      description: "House publisher name and SAMRO / PRO membership numbers.",
      meta: statusLabel(
        publisherReady,
        settingSource(SETTINGS.PUBLISHER_HOUSE_NAME),
      ),
      badge: 0,
    },
    {
      href: "/admin/settings/ai",
      title: "AI",
      description: "Gemini API key and model for tagging. Other providers later.",
      meta: statusLabel(
        aiReady,
        settingSource(SETTINGS.GEMINI_API_KEY) === "none" && aiReady
          ? "env"
          : settingSource(SETTINGS.GEMINI_API_KEY),
      ),
      badge: 0,
    },
    {
      href: "/admin/settings/storage",
      title: "Storage",
      description: "DigitalOcean Spaces credentials for the audio vault.",
      meta: statusLabel(
        spacesReady,
        settingSource(SETTINGS.SPACES_KEY) !== "none"
          ? settingSource(SETTINGS.SPACES_KEY)
          : settingSource(SETTINGS.SPACES_BUCKET),
      ),
      badge: 0,
    },
    {
      href: "/admin/settings/email",
      title: "Email",
      description: "Resend for playlist invites and license-request alerts.",
      meta: statusLabel(mailReady, settingSource(SETTINGS.RESEND_API_KEY)),
      badge: 0,
    },
  ];

  return (
    <main className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-8">
      <header className="mb-6 max-w-3xl border-b border-[var(--line)] pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
          Admin
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-dim)]">
          Site administration — users, licensing, AI, storage, and email.
        </p>
      </header>

      <section className="mb-6 max-w-3xl rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-5">
        <h2 className="text-sm font-medium text-[var(--ink)]">License inventory (this server)</h2>
        <p className="mt-1 text-sm text-[var(--ink-dim)]">
          Partner / QueSunc search only returns Clear.
          {partnerClear === 0
            ? " Right now Clear is 0 — mark tracks Clear on Browse (edit → License = Clear → save), then refresh QueSunc."
            : ` ${partnerClear} Clear track${partnerClear === 1 ? "" : "s"} are available to partners.`}
        </p>
        <p className="mt-3 text-sm tabular-nums text-[var(--ink)]">
          {trackTotal} active · Clear {partnerClear} · Library {library} · Exclusive{" "}
          {exclusive} · On Hold {hold} · Personal {personal}
        </p>
        <p className="mt-2">
          <Link
            href="/?license=clear"
            className="text-sm text-[var(--accent)] underline-offset-2 hover:underline"
          >
            Browse Clear tracks
          </Link>
        </p>
      </section>

      <ul className="grid max-w-3xl gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.title}>
            <Link
              href={card.href}
              className="block rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-5 transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="text-base font-medium text-[var(--ink)]">{card.title}</div>
                  {card.badge > 0 ? (
                    <span
                      className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--exclusive)] px-1.5 text-[10px] font-semibold tabular-nums text-white"
                      aria-label={
                        card.title === "Licensing"
                          ? `${card.badge} pending license request${card.badge === 1 ? "" : "s"}`
                          : `${card.badge} pending user request${card.badge === 1 ? "" : "s"}`
                      }
                    >
                      {card.badge > 99 ? "99+" : card.badge}
                    </span>
                  ) : null}
                </div>
                {card.meta ? (
                  <span
                    className={`shrink-0 text-[10px] uppercase tracking-[0.12em] ${
                      card.meta.startsWith("Not")
                        ? "text-[var(--exclusive)]"
                        : "text-[var(--available)]"
                    }`}
                  >
                    {card.meta}
                  </span>
                ) : card.badge > 0 ? (
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-[var(--exclusive)]">
                    {card.badge} pending
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-sm text-[var(--ink-dim)]">{card.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

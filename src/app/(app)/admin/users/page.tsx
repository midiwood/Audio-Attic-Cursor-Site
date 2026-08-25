import Link from "next/link";
import { UsersManager } from "@/components/users-manager";
import { auth, requireSiteAdmin } from "@/lib/auth";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await requireSiteAdmin("/admin/users");
  const listed = await auth.api.listUsers({
    query: { limit: 200, sortBy: "email", sortDirection: "asc" },
    headers: await headers(),
  });

  return (
    <main className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-8">
      <Link
        href="/admin/site"
        className="mb-4 inline-flex text-sm text-[var(--ink-dim)] transition hover:text-[var(--accent)]"
      >
        ← Admin
      </Link>
      <header className="mb-6 max-w-3xl border-b border-[var(--line)] pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
          Users
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-dim)]">
          Manage who can sign in. Approve self-signups and set roles.
        </p>
      </header>
      <UsersManager
        initialUsers={listed.users || []}
        currentUserId={session.user.id}
      />
    </main>
  );
}

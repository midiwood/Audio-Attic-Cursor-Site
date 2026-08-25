import { SignupForm } from "@/components/signup-form";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getSession()) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-5 py-16">
      <div className="mb-8 text-center">
        <div className="text-2xl font-semibold tracking-tight text-[var(--ink)]">Audio Attic</div>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--ink-dim)]">
          Request access
        </p>
      </div>
      <SignupForm />
    </main>
  );
}

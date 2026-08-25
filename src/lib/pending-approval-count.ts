import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { PENDING_APPROVAL_REASON } from "@/lib/pending-approval";

export function countPendingApprovals(): number {
  const row = db
    .select({ value: count() })
    .from(user)
    .where(and(eq(user.banned, true), eq(user.banReason, PENDING_APPROVAL_REASON)))
    .get();
  return Number(row?.value ?? 0);
}

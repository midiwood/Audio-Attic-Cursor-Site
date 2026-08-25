/** Ban reason used while a self-signup awaits admin approval. */
export const PENDING_APPROVAL_REASON = "pending_approval";

export function isPendingApproval(user: {
  banned?: boolean | null;
  banReason?: string | null;
}): boolean {
  return Boolean(user.banned && user.banReason === PENDING_APPROVAL_REASON);
}

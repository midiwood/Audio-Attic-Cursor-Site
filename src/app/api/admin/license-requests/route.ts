import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import {
  isLicenseRequestStatus,
  listLicenseRequests,
  type LicenseRequestStatus,
} from "@/lib/license-requests";

export async function GET(req: NextRequest) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const statusParam = req.nextUrl.searchParams.get("status") || "pending";
  const status =
    statusParam === "all"
      ? undefined
      : isLicenseRequestStatus(statusParam)
        ? (statusParam as LicenseRequestStatus)
        : "pending";

  const requests = listLicenseRequests({ status });
  return NextResponse.json({ requests });
}

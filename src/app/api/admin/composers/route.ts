import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import {
  createComposer,
  ensureHouseComposer,
  listComposers,
  updateComposer,
} from "@/lib/composers";
import { getHousePublisherName } from "@/lib/publisher";
import { getPublisherRuntimeConfig } from "@/lib/site-settings";

export const runtime = "nodejs";

export async function GET() {
  const auth = await getCatalogStaffSession();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });

  const cfg = getPublisherRuntimeConfig();
  const houseName = cfg.houseName.trim() || getHousePublisherName();
  if (houseName) {
    ensureHouseComposer({
      displayName: houseName,
      ipiPa: cfg.proPaIpiNameNumber.trim() || cfg.proIpiBaseNumber.trim(),
      ipiBase: cfg.proIpiBaseNumber.trim() || undefined,
    });
  }

  return NextResponse.json({ composers: listComposers({ includeDisabled: true }) });
}

export async function POST(req: NextRequest) {
  const auth = await getCatalogStaffSession();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as {
    displayName?: string;
    ipiPa?: string;
    ipiBase?: string;
    proSociety?: string;
    notes?: string;
  };

  const displayName = String(body.displayName || "").trim();
  const ipiPa = String(body.ipiPa || "").trim();
  if (!displayName) {
    return NextResponse.json({ error: "Display name is required" }, { status: 400 });
  }
  if (!ipiPa) {
    return NextResponse.json({ error: "PA IPI name number is required" }, { status: 400 });
  }

  const composer = createComposer({
    displayName,
    ipiPa,
    ipiBase: body.ipiBase,
    proSociety: body.proSociety,
    notes: body.notes,
  });

  return NextResponse.json({ composer });
}

export async function PATCH(req: NextRequest) {
  const auth = await getCatalogStaffSession();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    displayName?: string;
    ipiPa?: string;
    ipiBase?: string;
    proSociety?: string;
    notes?: string;
    disabled?: boolean;
  };

  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const composer = updateComposer(id, {
    displayName: body.displayName,
    ipiPa: body.ipiPa,
    ipiBase: body.ipiBase,
    proSociety: body.proSociety,
    notes: body.notes,
    disabled: body.disabled,
  });

  if (!composer) {
    return NextResponse.json({ error: "Composer not found" }, { status: 404 });
  }

  return NextResponse.json({ composer });
}

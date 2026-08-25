import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import { buildSamroWorkbookBuffer } from "@/lib/samro-export";
import { getSamroProProfileFromSiteSettings } from "@/lib/publisher";
import { markSamroSubmissionExported } from "@/lib/samro-submissions";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getCatalogStaffSession();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });

  const { id } = await context.params;
  const profile = getSamroProProfileFromSiteSettings();

  try {
    const { buffer, fileName } = await buildSamroWorkbookBuffer(id, profile);
    markSamroSubmissionExported(id);
    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

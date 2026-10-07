import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import { buildCapassoWorkbookBuffer } from "@/lib/capasso-export";
import { getCapassoProProfileFromSiteSettings } from "@/lib/site-settings";
import { markCapassoSubmissionExported } from "@/lib/capasso-submissions";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getCatalogStaffSession();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });

  const { id } = await context.params;
  const profile = getCapassoProProfileFromSiteSettings();

  try {
    const { buffer, fileName } = await buildCapassoWorkbookBuffer(id, profile);
    markCapassoSubmissionExported(id);
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

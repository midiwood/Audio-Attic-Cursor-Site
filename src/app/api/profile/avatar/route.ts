import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function extFor(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("avatar");
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: "Choose an image file" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Use JPEG, PNG, or WebP" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be under 2 MB" }, { status: 400 });
  }

  const userId = session.user.id;
  const dir = path.join(process.cwd(), "public", "avatars");
  await mkdir(dir, { recursive: true });

  const ext = extFor(file.type);
  const filename = `${userId}.${ext}`;
  const diskPath = path.join(dir, filename);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(diskPath, bytes);

  // Drop other extensions for this user so only one avatar remains.
  for (const other of ["jpg", "jpeg", "png", "webp"]) {
    if (other === ext) continue;
    try {
      await unlink(path.join(dir, `${userId}.${other}`));
    } catch {
      // ignore missing
    }
  }

  const imageUrl = `/avatars/${filename}?v=${Date.now()}`;
  const updated = await auth.api.updateUser({
    body: { image: imageUrl },
    headers: await headers(),
  });

  if (!updated) {
    return NextResponse.json({ error: "Could not update profile photo" }, { status: 500 });
  }

  return NextResponse.json({ image: imageUrl });
}

export async function DELETE() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const dir = path.join(process.cwd(), "public", "avatars");
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    try {
      await unlink(path.join(dir, `${userId}.${ext}`));
    } catch {
      // ignore
    }
  }

  await auth.api.updateUser({
    body: { image: null },
    headers: await headers(),
  });

  return NextResponse.json({ ok: true });
}

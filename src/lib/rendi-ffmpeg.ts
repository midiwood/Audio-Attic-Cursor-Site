/**
 * Rendi FFmpeg-as-a-service client.
 * https://rendi.dev/docs — used when FFMPEG_BACKEND is not "local".
 */

import "server-only";

const RENDI_API = "https://api.rendi.dev/v1";
const POLL_MS = 2000;
const DEFAULT_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_UPLOAD_WAIT_MS = 5 * 60 * 1000;

export function rendiApiKey(): string {
  return String(process.env["RENDI_API_KEY"] || "").trim();
}

export function rendiConfigured(): boolean {
  return Boolean(rendiApiKey());
}

function headers(json = true): HeadersInit {
  const key = rendiApiKey();
  if (!key) throw new Error("RENDI_API_KEY is not set (Admin env / .env.local)");
  const h: Record<string, string> = { "X-API-KEY": key };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function rendiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RENDI_API}${path}`, {
    ...init,
    headers: { ...headers(true), ...(init?.headers || {}) },
  });
  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { detail: text };
  }
  if (!res.ok) {
    const detail =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : text.slice(0, 300);
    throw new Error(`Rendi ${path} failed (${res.status}): ${detail || res.statusText}`);
  }
  return body as T;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type InitUploadResponse = {
  file_id: string;
  part_size: number;
  upload_urls: string[];
};

type FileStatusResponse = {
  file_id: string;
  status: string;
  storage_url?: string | null;
  error_status?: string | null;
  external_error_message?: string | null;
};

type CommandStatusResponse = {
  command_id: string;
  status: string;
  error_status?: string | null;
  error_message?: string | null;
  output_files?: Record<
    string,
    {
      storage_url?: string | null;
      status?: string;
      file_id?: string;
    }
  >;
};

/** Multipart upload buffer → wait until STORED → return public storage_url. */
export async function rendiUploadBuffer(
  bytes: Buffer,
  filename: string,
): Promise<{ fileId: string; storageUrl: string }> {
  const safeName = filename.replace(/[^\w.\-]+/g, "_") || "audio.bin";
  const init = await rendiJson<InitUploadResponse>("/files/init-upload", {
    method: "POST",
    body: JSON.stringify({
      filename: safeName,
      size_bytes: bytes.length,
    }),
  });

  const partSize = Number(init.part_size) || bytes.length;
  const urls = init.upload_urls || [];
  if (!init.file_id || !urls.length) {
    throw new Error("Rendi init-upload missing file_id or upload_urls");
  }

  const parts: Array<{ part_number: number; etag: string }> = [];
  for (let i = 0; i < urls.length; i++) {
    const start = i * partSize;
    const chunk = bytes.subarray(start, Math.min(start + partSize, bytes.length));
    const put = await fetch(urls[i], {
      method: "PUT",
      body: new Uint8Array(chunk),
    });
    if (!put.ok) {
      throw new Error(`Rendi upload part ${i + 1} failed (${put.status})`);
    }
    const etag = put.headers.get("ETag") || put.headers.get("etag");
    if (!etag) throw new Error(`Rendi upload part ${i + 1} missing ETag`);
    parts.push({ part_number: i + 1, etag });
  }

  await rendiJson(`/files/${init.file_id}/complete-upload`, {
    method: "POST",
    body: JSON.stringify({ parts }),
  });

  const deadline = Date.now() + DEFAULT_UPLOAD_WAIT_MS;
  while (Date.now() < deadline) {
    const file = await rendiJson<FileStatusResponse>(`/files/${init.file_id}`);
    const status = String(file.status || "").toUpperCase();
    if (status === "STORED" && file.storage_url) {
      return { fileId: init.file_id, storageUrl: file.storage_url };
    }
    if (status === "FAILED" || file.error_status) {
      throw new Error(
        file.external_error_message ||
          file.error_status ||
          "Rendi file processing failed",
      );
    }
    await sleep(POLL_MS);
  }
  throw new Error("Rendi timed out waiting for uploaded file to become STORED");
}

export async function rendiRunFfmpeg(opts: {
  inputUrl: string;
  outputFilename: string;
  /** FFmpeg args after binary name; use {{in_1}} and {{out_1}}. */
  ffmpegCommand: string;
  maxCommandRunSeconds?: number;
}): Promise<{ commandId: string; outputUrl: string }> {
  const submit = await rendiJson<{ command_id: string }>("/run-ffmpeg-command", {
    method: "POST",
    body: JSON.stringify({
      input_files: { in_1: opts.inputUrl },
      output_files: { out_1: opts.outputFilename },
      ffmpeg_command: opts.ffmpegCommand,
      max_command_run_seconds: opts.maxCommandRunSeconds ?? 600,
    }),
  });

  const commandId = submit.command_id;
  if (!commandId) throw new Error("Rendi did not return command_id");

  const deadline = Date.now() + DEFAULT_COMMAND_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await rendiJson<CommandStatusResponse>(`/commands/${commandId}`);
    const state = String(status.status || "").toUpperCase();
    if (state === "SUCCESS") {
      const out = status.output_files?.out_1;
      const url = out?.storage_url;
      if (!url) throw new Error("Rendi SUCCESS but missing output storage_url");
      return { commandId, outputUrl: url };
    }
    if (state === "FAILED" || state === "ERROR") {
      throw new Error(
        status.error_message ||
          status.error_status ||
          `Rendi command failed (${state})`,
      );
    }
    await sleep(POLL_MS);
  }
  throw new Error("Rendi timed out waiting for FFmpeg command");
}

export async function rendiDownloadUrl(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download Rendi output (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Best-effort cleanup; ignore errors. */
export async function rendiDeleteFile(fileId: string): Promise<void> {
  try {
    await rendiJson(`/files/${fileId}`, { method: "DELETE" });
  } catch {
    // ignore
  }
}

/** Best-effort cleanup of all outputs for a command. */
export async function rendiDeleteCommandFiles(commandId: string): Promise<void> {
  try {
    await rendiJson(`/commands/${commandId}/files`, { method: "DELETE" });
  } catch {
    // ignore
  }
}

/**
 * Upload bytes, run one FFmpeg command, download out_1, then clean up.
 */
export async function rendiProcessAudio(opts: {
  sourceBytes: Buffer;
  sourceFilename: string;
  ffmpegCommand: string;
  outputFilename: string;
}): Promise<Buffer> {
  const uploaded = await rendiUploadBuffer(opts.sourceBytes, opts.sourceFilename);
  let commandId: string | undefined;
  try {
    const ran = await rendiRunFfmpeg({
      inputUrl: uploaded.storageUrl,
      outputFilename: opts.outputFilename,
      ffmpegCommand: opts.ffmpegCommand,
    });
    commandId = ran.commandId;
    return await rendiDownloadUrl(ran.outputUrl);
  } finally {
    if (commandId) void rendiDeleteCommandFiles(commandId);
    void rendiDeleteFile(uploaded.fileId);
  }
}

/**
 * Keep one uploaded input for multiple sequential commands (measure → apply).
 */
export async function withRendiUploadedInput<T>(
  sourceBytes: Buffer,
  sourceFilename: string,
  fn: (inputUrl: string) => Promise<T>,
): Promise<T> {
  const uploaded = await rendiUploadBuffer(sourceBytes, sourceFilename);
  try {
    return await fn(uploaded.storageUrl);
  } finally {
    void rendiDeleteFile(uploaded.fileId);
  }
}

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSpacesRuntimeConfig, normalizeSpacesRegion, parseSpacesBucketInput } from "@/lib/site-settings";

const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;

/** AWS SDK v3 signing region for DO Spaces (datacenter is set via endpoint). */
const SPACES_SIGNING_REGION = "us-east-1";

/** Known DigitalOcean Spaces datacenters (for region auto-detection). */
const SPACES_DATACENTERS = [
  "nyc3",
  "sfo3",
  "sfo2",
  "ams3",
  "sgp1",
  "lon1",
  "fra1",
  "tor1",
  "blr1",
  "syd1",
] as const;

type SpacesClientConfig = {
  key: string;
  secret: string;
  bucket: string;
  region: string;
  apiEndpoint: string;
};

let cachedClient: S3Client | null = null;
let cachedFingerprint = "";

function resolveClientConfig(
  override?: Partial<{
    key: string;
    secret: string;
    bucket: string;
    region: string;
  }>,
): SpacesClientConfig {
  const saved = getSpacesRuntimeConfig();
  const key = override?.key?.trim() || saved.key;
  const secret = override?.secret?.trim() || saved.secret;
  const bucketInput = override?.bucket?.trim() || saved.bucket;
  const regionInput = override?.region?.trim() || saved.region || "nyc3";
  const parsed = parseSpacesBucketInput(bucketInput);
  const region = normalizeSpacesRegion(parsed.region || regionInput);
  const bucket = parsed.bucket;
  return {
    key,
    secret,
    bucket,
    region,
    apiEndpoint: `https://${region}.digitaloceanspaces.com`,
  };
}

function configFingerprint(cfg: SpacesClientConfig) {
  return [cfg.key, cfg.secret, cfg.bucket, cfg.region, cfg.apiEndpoint].join("|");
}

function createClient(cfg: SpacesClientConfig): S3Client {
  if (!cfg.key || !cfg.secret || !cfg.bucket || !cfg.region) {
    throw new Error("DigitalOcean Spaces is not configured");
  }

  return new S3Client({
    endpoint: cfg.apiEndpoint,
    region: SPACES_SIGNING_REGION,
    credentials: {
      accessKeyId: cfg.key,
      secretAccessKey: cfg.secret,
    },
    forcePathStyle: false,
  });
}

function getClient(): S3Client {
  const cfg = resolveClientConfig();
  const fp = configFingerprint(cfg);
  if (cachedClient && cachedFingerprint === fp) return cachedClient;

  cachedClient = createClient(cfg);
  cachedFingerprint = fp;
  return cachedClient;
}

export function clearSpacesClientCache() {
  cachedClient = null;
  cachedFingerprint = "";
}

export function spacesConfigured(): boolean {
  const cfg = getSpacesRuntimeConfig();
  return Boolean(cfg.key && cfg.secret && cfg.bucket && cfg.region);
}

export function spacesSetupMessage(): string {
  return "Configure DigitalOcean Spaces in Admin → Storage (access key, secret, bucket, region).";
}

function httpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  return (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
}

function formatS3Error(err: unknown, cfg?: SpacesClientConfig): string {
  if (!err || typeof err !== "object") return "Connection failed";

  const e = err as Record<string, unknown>;
  const name = String(e.name || "");
  const message = String(e.message || "");
  const status = httpStatus(err);

  if (status === 403) {
    return "Access denied — check access key, secret, and that the key can access this bucket.";
  }
  if (status === 404 && cfg) {
    return `Bucket “${cfg.bucket}” was not found in ${cfg.region}. In DigitalOcean, open your Space and confirm the exact bucket name and datacenter region.`;
  }
  if (message && message !== "UnknownError") return message;
  if (name && name !== "UnknownError") return name;
  if (status) {
    return `Spaces request failed (HTTP ${status}). Check credentials, bucket name, and region.`;
  }
  return "Connection failed — check credentials, bucket name, and region.";
}

async function listBucketProbe(client: S3Client, bucket: string): Promise<void> {
  await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      MaxKeys: 1,
    }),
  );
}

async function findBucketRegion(
  base: Pick<SpacesClientConfig, "key" | "secret" | "bucket">,
  skipRegion: string,
): Promise<string | null> {
  for (const region of SPACES_DATACENTERS) {
    if (region === skipRegion) continue;
    try {
      const client = createClient({
        ...base,
        region,
        apiEndpoint: `https://${region}.digitaloceanspaces.com`,
      });
      await listBucketProbe(client, base.bucket);
      return region;
    } catch (err) {
      const status = httpStatus(err);
      if (status === 403) return null;
    }
  }
  return null;
}

export async function testSpacesConnection(
  override?: Partial<{
    key: string;
    secret: string;
    bucket: string;
    region: string;
  }>,
): Promise<
  | { ok: true; region: string; regionCorrected: boolean; bucket: string }
  | { ok: false; error: string }
> {
  try {
    const cfg = resolveClientConfig(override);
    if (!cfg.key || !cfg.secret || !cfg.bucket) {
      return {
        ok: false,
        error: "Access key, secret key, and bucket name are required.",
      };
    }

    const client = createClient(cfg);
    try {
      await listBucketProbe(client, cfg.bucket);
      return { ok: true, region: cfg.region, regionCorrected: false, bucket: cfg.bucket };
    } catch (err) {
      if (httpStatus(err) !== 404) {
        return { ok: false, error: formatS3Error(err, cfg) };
      }

      const foundRegion = await findBucketRegion(cfg, cfg.region);
      if (foundRegion) {
        return {
          ok: true,
          region: foundRegion,
          regionCorrected: true,
          bucket: cfg.bucket,
        };
      }

      return { ok: false, error: formatS3Error(err, cfg) };
    }
  } catch (err) {
    return { ok: false, error: formatS3Error(err) };
  }
}

export async function uploadObject(
  key: string,
  bytes: Buffer,
  contentType = "audio/mpeg",
): Promise<void> {
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Upload exceeds limit (${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB)`,
    );
  }
  const runtime = getSpacesRuntimeConfig();
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: runtime.bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      ACL: "private",
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  const normalized = key.trim();
  if (!normalized) return;
  const runtime = getSpacesRuntimeConfig();
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: runtime.bucket,
      Key: normalized,
    }),
  );
}

export async function copyObject(fromKey: string, toKey: string): Promise<void> {
  const runtime = getSpacesRuntimeConfig();
  const client = getClient();
  await client.send(
    new CopyObjectCommand({
      Bucket: runtime.bucket,
      CopySource: `${runtime.bucket}/${fromKey}`,
      Key: toKey,
      ACL: "private",
      ContentType: "audio/mpeg",
    }),
  );
}

export async function headObject(
  key: string,
): Promise<{ exists: boolean; etag: string | null }> {
  const normalized = key.trim();
  if (!normalized) return { exists: false, etag: null };
  try {
    const runtime = getSpacesRuntimeConfig();
    const client = getClient();
    const res = await client.send(
      new HeadObjectCommand({
        Bucket: runtime.bucket,
        Key: normalized,
      }),
    );
    const etag = String(res.ETag || "").replace(/"/g, "").trim();
    return { exists: true, etag: etag || null };
  } catch (err) {
    const status = httpStatus(err);
    const name = err && typeof err === "object" ? String((err as { name?: string }).name || "") : "";
    if (status === 404 || name === "NotFound" || name === "NoSuchKey") {
      return { exists: false, etag: null };
    }
    throw err;
  }
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const runtime = getSpacesRuntimeConfig();
  const client = getClient();
  const res = await client.send(
    new GetObjectCommand({
      Bucket: runtime.bucket,
      Key: key,
    }),
  );
  const body = res.Body;
  if (!body) throw new Error(`Object not found: ${key}`);
  const bytes = Buffer.from(await body.transformToByteArray());
  if (bytes.length > MAX_DOWNLOAD_BYTES) {
    throw new Error("Object is too large to download");
  }
  return bytes;
}

export type PresignGetOptions = {
  downloadFilename?: string;
  expiresInSec?: number;
};

export async function presignGetUrl(key: string, opts?: PresignGetOptions): Promise<string> {
  const runtime = getSpacesRuntimeConfig();
  const client = getClient();
  const command = new GetObjectCommand({
    Bucket: runtime.bucket,
    Key: key,
    ...(opts?.downloadFilename
      ? {
          ResponseContentDisposition: `attachment; filename="${opts.downloadFilename.replace(/"/g, "")}"`,
        }
      : {}),
  });
  const expiresIn = opts?.expiresInSec ?? runtime.presignTtlSec;
  let url = await getSignedUrl(client, command, { expiresIn });

  if (runtime.cdnEndpoint) {
    try {
      const parsed = new URL(url);
      const cdn = new URL(runtime.cdnEndpoint);
      parsed.hostname = cdn.hostname;
      url = parsed.toString();
    } catch {
      // Keep origin URL if CDN override is malformed.
    }
  }

  return url;
}

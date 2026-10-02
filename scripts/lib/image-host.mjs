// img.durar.space helpers shared by scripts/cards.mjs and scripts/illustrations.mjs.
// Reads go through the public CloudFront host (the CI key can only PutObject); writes go to S3.
import { IMAGE_BUCKET, IMAGE_ORIGIN, IMAGE_REGION } from '../../shared/cards.ts';

/** Sent with every HEAD, so the answer shows whether CloudFront adds the CORS header the site needs. */
const SITE_ORIGIN_HEADER = { Origin: 'https://durar.space' };
export const IMMUTABLE = 'public, max-age=31536000, immutable';
/** CloudFront keeps a 403/404 for about 10 s, so a file uploaded a moment ago can still look missing. */
const NEGATIVE_CACHE_MS = 15_000;

/** Runs `fn` over `items`, `n` at a time. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/**
 * HEADs each key on the public host. Returns { missing, noCors } (lists of keys).
 * 403/404 = missing (CloudFront answers 403 for absent objects in a private bucket); other errors throw.
 */
export async function headOnHost(keys) {
  const res = await pool(keys, 16, async (key) => {
    const url = `${IMAGE_ORIGIN}/${key}`;
    const r = await fetch(url, { method: 'HEAD', headers: SITE_ORIGIN_HEADER }).catch((e) => {
      throw new Error(`can't reach ${url} (${e.cause?.code ?? e.message}). Is img.durar.space set up?`);
    });
    if (r.status === 403 || r.status === 404) return { key, missing: true };
    if (!r.ok) throw new Error(`${url} answered ${r.status}`);
    return { key, missing: false, cors: r.headers.get('access-control-allow-origin') !== null };
  });
  return {
    missing: res.filter((r) => r.missing).map((r) => r.key),
    noCors: res.filter((r) => !r.missing && !r.cors).map((r) => r.key),
  };
}

/** Like headOnHost, but asks again about missing keys once CloudFront's negative cache has expired. */
export async function checkOnHost(keys, { wait = NEGATIVE_CACHE_MS } = {}) {
  const first = await headOnHost(keys);
  if (!first.missing.length) return first;
  await new Promise((r) => setTimeout(r, wait));
  const again = await headOnHost(first.missing);
  return { missing: again.missing, noCors: [...first.noCors, ...again.noCors] };
}

/** An S3 client for the image bucket, from the upload-only key in GitHub's repository secrets. */
export async function s3() {
  const accessKeyId = process.env.IMAGES_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.IMAGES_AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey)
    throw new Error('IMAGES_AWS_ACCESS_KEY_ID and IMAGES_AWS_SECRET_ACCESS_KEY must be set (GitHub repository secrets).');
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({ region: IMAGE_REGION, credentials: { accessKeyId, secretAccessKey } });
  return { send: (input) => client.send(new PutObjectCommand({ Bucket: IMAGE_BUCKET, ...input })) };
}

/** Write-once upload: S3 refuses to overwrite (If-None-Match: *). Returns 'uploaded' or 'exists'. */
export async function putOnce(client, Key, Body, ContentType) {
  try {
    await client.send({ Key, Body, ContentType, CacheControl: IMMUTABLE, IfNoneMatch: '*' });
    return 'uploaded';
  } catch (e) {
    const status = e?.$metadata?.httpStatusCode;
    if (status === 412 || status === 409) return 'exists';
    throw e;
  }
}

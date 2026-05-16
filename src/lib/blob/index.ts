import { put } from "@vercel/blob";

export interface StoreAssetUploadInput {
  storeId: string;
  pathname: string;
  body: Blob | ArrayBuffer | Buffer | string;
  contentType: string;
}

export interface StoreAssetUploadFromUrlInput {
  storeId: string;
  pathname: string;
  url: string;
  contentType?: string;
}

export interface StoreAsset {
  url: string;
  pathname: string;
  contentType: string;
}

export async function uploadStoreAsset(
  input: StoreAssetUploadInput,
): Promise<StoreAsset> {
  assertBlobConfigured();

  const pathname = createStoreAssetPathname(input.storeId, input.pathname);
  const blob = await put(pathname, input.body, {
    access: "public",
    allowOverwrite: true,
    contentType: input.contentType,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: blob.contentType ?? input.contentType,
  };
}

export async function uploadStoreAssetFromUrl(
  input: StoreAssetUploadFromUrlInput,
): Promise<StoreAsset> {
  const response = await fetch(input.url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch generated asset before Blob upload: ${response.status}`,
    );
  }

  const contentType =
    input.contentType ??
    response.headers.get("content-type") ??
    "application/octet-stream";

  return uploadStoreAsset({
    storeId: input.storeId,
    pathname: input.pathname,
    body: await response.arrayBuffer(),
    contentType,
  });
}

export function createStoreAssetPathname(storeId: string, pathname: string) {
  const normalizedStoreId = sanitizePathSegment(storeId);
  const normalizedPathname = pathname
    .split("/")
    .map(sanitizePathSegment)
    .filter(Boolean)
    .join("/");

  return `stores/${normalizedStoreId}/${normalizedPathname || "asset"}`;
}

function assertBlobConfigured() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required to upload store assets.");
  }
}

function sanitizePathSegment(segment: string) {
  return segment
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/(^[-.]+|[-.]+$)/g, "");
}

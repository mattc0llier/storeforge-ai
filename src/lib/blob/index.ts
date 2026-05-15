export interface StoreAssetUploadInput {
  storeId: string;
  pathname: string;
  body: Blob | ArrayBuffer | Uint8Array;
  contentType: string;
}

export interface StoreAsset {
  url: string;
  pathname: string;
}

export async function uploadStoreAsset(
  input: StoreAssetUploadInput,
): Promise<StoreAsset> {
  void input;
  // TODO: Persist generated imagery and brand assets with Vercel Blob.
  throw new Error("Store asset upload is not implemented yet.");
}

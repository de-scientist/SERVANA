export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface UploadRequest {
  key: string;
  contentType: string;
  data: Buffer;
  isPublic: boolean;
}

export interface UploadResult {
  storageKey: string;
  url: string;
}

/**
 * Object-storage contract (S3-compatible). Real adapter uses presigned URLs
 * and a private bucket; documents are never publicly exposed.
 */
export interface StorageProvider {
  readonly id: string;
  upload(req: UploadRequest): Promise<UploadResult>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

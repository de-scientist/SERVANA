import { Injectable } from '@nestjs/common';
import { StorageProvider, UploadRequest, UploadResult } from './storage.provider';

@Injectable()
export class StubStorageProvider implements StorageProvider {
  readonly id = 'stub';

  async upload(req: UploadRequest): Promise<UploadResult> {
    // Foundation stub: returns a deterministic key + placeholder URL.
    return {
      storageKey: req.key,
      url: `https://storage.local/${req.key}`,
    };
  }

  async getSignedUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return `https://storage.local/signed/${key}?exp=${expiresInSeconds}`;
  }
}

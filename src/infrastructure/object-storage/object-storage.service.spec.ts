import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { type ConfigType } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { objectStorageConfig } from '../../config/configuration.js';
import { ObjectStorageService } from './object-storage.service.js';

const { getSignedUrl } = vi.hoisted(() => ({
  getSignedUrl: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl,
}));

const storage = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  bucket: 'private-evidence',
  accessKey: 'access-key',
  secretKey: 'secret-key',
  forcePathStyle: true,
  signedUrlTtlSeconds: 300,
  serverSideEncryption: 'AES256',
  kmsKeyId: undefined,
} as ConfigType<typeof objectStorageConfig>;

function createService(): ObjectStorageService {
  return new ObjectStorageService({} as S3Client, storage);
}

describe('ObjectStorageService', () => {
  beforeEach(() => {
    getSignedUrl.mockReset();
  });

  it('creates an encrypted, checksum-protected scoped upload URL', async () => {
    getSignedUrl.mockResolvedValueOnce('https://storage.example/upload');

    const result = await createService().createUploadUrl({
      scope: 'evidence/submission-123',
      contentType: 'application/pdf',
      contentLength: 4_096,
      checksumSha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    });

    expect(result).toMatchObject({
      key: expect.stringMatching(
        /^evidence\/submission-123\/[0-9a-f-]{36}$/,
      ),
      url: 'https://storage.example/upload',
    });
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(PutObjectCommand),
      { expiresIn: 300 },
    );

    const command = getSignedUrl.mock.calls[0][1] as PutObjectCommand;
    expect(command.input).toMatchObject({
      Bucket: 'private-evidence',
      ContentType: 'application/pdf',
      ContentLength: 4_096,
      ChecksumSHA256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      Metadata: {
        'checksum-sha256': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      },
      ServerSideEncryption: 'AES256',
    });
  });

  it('creates a download URL only for a key inside its scope', async () => {
    getSignedUrl.mockResolvedValueOnce('https://storage.example/download');

    const result = await createService().createDownloadUrl({
      scope: 'evidence/submission-123',
      key: 'evidence/submission-123/asset-456',
    });

    expect(result.url).toBe('https://storage.example/download');
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(GetObjectCommand),
      { expiresIn: 300 },
    );

    const command = getSignedUrl.mock.calls[0][1] as GetObjectCommand;
    expect(command.input).toEqual({
      Bucket: 'private-evidence',
      Key: 'evidence/submission-123/asset-456',
      ChecksumMode: 'ENABLED',
    });
  });

  it('rejects unsafe scopes, invalid checksums and cross-scope downloads', async () => {
    const service = createService();

    await expect(
      service.createUploadUrl({
        scope: '../private',
        contentType: 'application/pdf',
        contentLength: 100,
        checksumSha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      }),
    ).rejects.toThrow('Object storage scope is invalid');
    await expect(
      service.createUploadUrl({
        scope: 'evidence/submission-123',
        contentType: 'application/pdf',
        contentLength: 100,
        checksumSha256: 'invalid',
      }),
    ).rejects.toThrow('Object checksum must be a Base64-encoded SHA-256 value');
    await expect(
      service.createDownloadUrl({
        scope: 'evidence/submission-123',
        key: 'evidence/other-submission/asset-456',
      }),
    ).rejects.toThrow('Object storage key is outside the requested scope');
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});

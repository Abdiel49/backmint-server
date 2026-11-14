import { randomUUID } from 'node:crypto';
import {
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { objectStorageConfig } from '../../config/configuration.js';
import { OBJECT_STORAGE_CLIENT } from './object-storage.constants.js';

export interface CreateUploadUrlInput {
  scope: string;
  contentType: string;
  contentLength: number;
  checksumSha256: string;
}

export interface CreateDownloadUrlInput {
  scope: string;
  key: string;
}

export interface StoredObjectMetadata {
  contentLength?: number;
  checksumSha256?: string;
  metadataChecksumSha256?: string;
}

export interface PresignedObjectUrl {
  key: string;
  url: string;
  expiresAt: Date;
}

@Injectable()
export class ObjectStorageService {
  constructor(
    @Inject(OBJECT_STORAGE_CLIENT)
    private readonly client: S3Client,
    @Inject(objectStorageConfig.KEY)
    private readonly storage: ConfigType<typeof objectStorageConfig>,
  ) {}

  async createUploadUrl(
    input: CreateUploadUrlInput,
  ): Promise<PresignedObjectUrl> {
    const scope = this.validateScope(input.scope);
    this.validateContentType(input.contentType);
    this.validateContentLength(input.contentLength);
    this.validateChecksum(input.checksumSha256);

    const key = `${scope}/${randomUUID()}`;
    const command = new PutObjectCommand({
      Bucket: this.storage.bucket,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
      ChecksumSHA256: input.checksumSha256,
      Metadata: {
        'checksum-sha256': input.checksumSha256,
      },
      ServerSideEncryption: this.storage.serverSideEncryption,
      SSEKMSKeyId: this.storage.kmsKeyId,
    });

    return this.createPresignedUrl(command, key);
  }

  async createDownloadUrl(
    input: CreateDownloadUrlInput,
  ): Promise<PresignedObjectUrl> {
    const scope = this.validateScope(input.scope);
    this.validateScopedKey(scope, input.key);

    const command = new GetObjectCommand({
      Bucket: this.storage.bucket,
      Key: input.key,
      ChecksumMode: 'ENABLED',
    });

    return this.createPresignedUrl(command, input.key);
  }

  async headObject(key: string, scope: string): Promise<StoredObjectMetadata> {
    const validatedScope = this.validateScope(scope);
    this.validateScopedKey(validatedScope, key);
    const result = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.storage.bucket,
        Key: key,
        ChecksumMode: 'ENABLED',
      }),
    );
    return {
      contentLength: result.ContentLength,
      checksumSha256: result.ChecksumSHA256,
      metadataChecksumSha256: result.Metadata?.['checksum-sha256'],
    };
  }

  async getObjectStream(
    key: string,
    scope: string,
  ): Promise<AsyncIterable<Uint8Array>> {
    const validatedScope = this.validateScope(scope);
    this.validateScopedKey(validatedScope, key);
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.storage.bucket, Key: key }),
    );
    if (!result.Body || !(Symbol.asyncIterator in result.Body)) {
      throw new Error('Stored object body is unavailable');
    }
    return result.Body as AsyncIterable<Uint8Array>;
  }

  private async createPresignedUrl(
    command: GetObjectCommand | PutObjectCommand,
    key: string,
  ): Promise<PresignedObjectUrl> {
    const url = await getSignedUrl(this.client, command, {
      expiresIn: this.storage.signedUrlTtlSeconds,
    });

    return {
      key,
      url,
      expiresAt: new Date(
        Date.now() + this.storage.signedUrlTtlSeconds * 1_000,
      ),
    };
  }

  private validateScope(scope: string): string {
    const segments = scope.split('/');

    if (
      !scope ||
      segments.some(
        (segment) =>
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(segment) ||
          segment === '.' ||
          segment === '..',
      )
    ) {
      throw new Error('Object storage scope is invalid');
    }

    return scope;
  }

  private validateScopedKey(scope: string, key: string): void {
    if (!key.startsWith(`${scope}/`) || key.length <= scope.length + 1) {
      throw new Error('Object storage key is outside the requested scope');
    }
  }

  private validateContentType(contentType: string): void {
    if (!contentType.trim() || /[\r\n]/.test(contentType)) {
      throw new Error('Object content type is invalid');
    }
  }

  private validateContentLength(contentLength: number): void {
    if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
      throw new Error('Object content length is invalid');
    }
  }

  private validateChecksum(checksumSha256: string): void {
    if (!/^[A-Za-z0-9+/]{43}=$/.test(checksumSha256)) {
      throw new Error('Object checksum must be a Base64-encoded SHA-256 value');
    }
  }
}

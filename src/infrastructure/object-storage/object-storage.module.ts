import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { objectStorageConfig } from '../../config/configuration.js';
import { OBJECT_STORAGE_CLIENT } from './object-storage.constants.js';

@Module({
  providers: [
    {
      provide: OBJECT_STORAGE_CLIENT,
      inject: [objectStorageConfig.KEY],
      useFactory: (storage: ConfigType<typeof objectStorageConfig>) =>
        new S3Client({
          endpoint: storage.endpoint,
          region: storage.region,
          forcePathStyle: storage.forcePathStyle,
          credentials: {
            accessKeyId: storage.accessKey,
            secretAccessKey: storage.secretKey,
          },
        }),
    },
  ],
  exports: [OBJECT_STORAGE_CLIENT],
})
export class ObjectStorageModule {}

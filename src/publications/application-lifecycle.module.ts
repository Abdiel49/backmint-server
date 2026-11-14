import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { PublicationsModule } from './publications.module.js';
import { ApplicationLifecycleController } from './application-lifecycle.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ObjectStorageModule } from '../infrastructure/object-storage/object-storage.module.js';
import { ApplicationAttachmentEntity } from './application-attachment.entity.js';
import { ApplicationAttachmentController } from './application-attachment.controller.js';
import { ApplicationAttachmentService } from './application-attachment.service.js';

@Module({
  imports: [IdentityModule, PublicationsModule, ObjectStorageModule, TypeOrmModule.forFeature([ApplicationAttachmentEntity])],
  controllers: [ApplicationLifecycleController, ApplicationAttachmentController],
  providers: [ApplicationAttachmentService],
})
export class ApplicationLifecycleModule {}

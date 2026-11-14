import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { PublicationsModule } from './publications.module.js';
import { ApplicationLifecycleController } from './application-lifecycle.controller.js';

@Module({
  imports: [IdentityModule, PublicationsModule],
  controllers: [ApplicationLifecycleController],
})
export class ApplicationLifecycleModule {}

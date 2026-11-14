import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityProviderEntity } from './identity-provider.entity.js';
import { IdentityService } from './identity.service.js';
import { UserEntity } from './user.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, IdentityProviderEntity])],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}

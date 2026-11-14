import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityProviderEntity } from './identity-provider.entity.js';
import { IdentityService } from './identity.service.js';
import { UserEntity } from './user.entity.js';
import { AuthSessionEntity } from './auth-session.entity.js';
import { AuthSessionGuard } from './auth-session.guard.js';
import { AuthSessionService } from './auth-session.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      IdentityProviderEntity,
      AuthSessionEntity,
    ]),
  ],
  providers: [IdentityService, AuthSessionService, AuthSessionGuard],
  exports: [IdentityService, AuthSessionService, AuthSessionGuard],
})
export class IdentityModule {}

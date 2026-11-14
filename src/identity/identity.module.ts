import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityProviderEntity } from './identity-provider.entity.js';
import { IdentityService } from './identity.service.js';
import { UserEntity } from './user.entity.js';
import { AuthSessionEntity } from './auth-session.entity.js';
import { AuthSessionGuard } from './auth-session.guard.js';
import { AuthSessionService } from './auth-session.service.js';
import { WalletChallengeEntity } from './wallet-challenge.entity.js';
import { WalletLinkEntity } from './wallet-link.entity.js';
import { WalletLinkService } from './wallet-link.service.js';
import { NearModule } from '../infrastructure/near/near.module.js';
import { AuthSessionController } from './auth-session.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      IdentityProviderEntity,
      AuthSessionEntity,
      WalletChallengeEntity,
      WalletLinkEntity,
    ]),
    NearModule,
  ],
  providers: [
    IdentityService,
    WalletLinkService,
    AuthSessionService,
    AuthSessionGuard,
  ],
  controllers: [AuthSessionController],
  exports: [
    IdentityService,
    WalletLinkService,
    AuthSessionService,
    AuthSessionGuard,
  ],
})
export class IdentityModule {}

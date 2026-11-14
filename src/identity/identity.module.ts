import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityProviderEntity } from './identity-provider.entity.js';
import { IdentityService } from './identity.service.js';
import { UserEntity } from './user.entity.js';
import { WalletChallengeEntity } from './wallet-challenge.entity.js';
import { WalletLinkEntity } from './wallet-link.entity.js';
import { WalletLinkService } from './wallet-link.service.js';
import { NearModule } from '../infrastructure/near/near.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      IdentityProviderEntity,
      WalletChallengeEntity,
      WalletLinkEntity,
    ]),
    NearModule,
  ],
  providers: [IdentityService, WalletLinkService],
  exports: [IdentityService, WalletLinkService],
})
export class IdentityModule {}

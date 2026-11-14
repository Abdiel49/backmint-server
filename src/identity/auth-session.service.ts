import {
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { appConfig } from '../config/configuration.js';
import { IdentityProviderEntity } from './identity-provider.entity.js';
import { AuthSessionEntity } from './auth-session.entity.js';
import { UserStatus } from './user.entity.js';

export type AuthenticatedSession = {
  id: string;
  userId: string;
};

@Injectable()
export class AuthSessionService {
  constructor(
    @InjectRepository(AuthSessionEntity)
    private readonly sessions: Repository<AuthSessionEntity>,
    @InjectRepository(IdentityProviderEntity)
    private readonly identities: Repository<IdentityProviderEntity>,
    @Inject(appConfig.KEY)
    private readonly app: ConfigType<typeof appConfig>,
  ) {}

  async createForVerifiedIdentity(
    identityProviderId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const identity = await this.identities.findOne({
      where: { id: identityProviderId },
      relations: { user: true },
    });

    if (
      !identity?.verifiedAt ||
      !identity.user ||
      identity.user.status !== UserStatus.Active
    ) {
      throw new UnauthorizedException('A verified active identity is required');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.app.sessionTtlSeconds * 1000,
    );
    await this.sessions.save(
      this.sessions.create({
        userId: identity.userId,
        tokenHash: this.hashToken(token),
        expiresAt,
        revokedAt: null,
        lastUsedAt: null,
      }),
    );

    return { token, expiresAt };
  }

  async authenticate(token: string): Promise<AuthenticatedSession | null> {
    if (!token || token.length > 128) {
      return null;
    }

    const session = await this.sessions.findOne({
      where: { tokenHash: this.hashToken(token) },
      relations: { user: true },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== UserStatus.Active
    ) {
      return null;
    }

    await this.sessions.update({ id: session.id }, { lastUsedAt: new Date() });
    return { id: session.id, userId: session.userId };
  }

  async revoke(sessionId: string, userId: string): Promise<void> {
    await this.sessions
      .createQueryBuilder()
      .update(AuthSessionEntity)
      .set({ revokedAt: new Date() })
      .where('id = :sessionId AND "userId" = :userId AND "revokedAt" IS NULL', {
        sessionId,
        userId,
      })
      .execute();
  }

  async revokeAll(userId: string): Promise<void> {
    await this.sessions
      .createQueryBuilder()
      .update(AuthSessionEntity)
      .set({ revokedAt: new Date() })
      .where('"userId" = :userId AND "revokedAt" IS NULL', { userId })
      .execute();
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

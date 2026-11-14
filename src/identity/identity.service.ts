import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import {
  IdentityProviderEntity,
  IdentityProviderType,
} from './identity-provider.entity.js';
import { UserEntity, UserStatus } from './user.entity.js';

export type RegisterUserInput = {
  email?: string;
  displayName: string;
  locale?: string;
};

@Injectable()
export class IdentityService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(IdentityProviderEntity)
    private readonly identityProviders: Repository<IdentityProviderEntity>,
  ) {}

  async registerUser(input: RegisterUserInput): Promise<UserEntity> {
    const email = input.email?.trim().toLowerCase() ?? null;
    const displayName = input.displayName.trim();
    const locale = input.locale?.trim().toLowerCase() || 'en';

    if (!displayName) {
      throw new TypeError('displayName is required');
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new TypeError('email is invalid');
    }
    if (!/^[a-z]{2}(-[a-z0-9]{2,8})?$/.test(locale)) {
      throw new TypeError('locale must be a valid language tag');
    }

    try {
      return await this.users.save(
        this.users.create({
          email,
          displayName,
          locale,
          status: UserStatus.Active,
        }),
      );
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async linkVerifiedIdentity(
    userId: string,
    provider: IdentityProviderType,
    subject: string,
    verifiedAt: Date,
  ): Promise<IdentityProviderEntity> {
    if (!userId.trim() || !subject.trim()) {
      throw new TypeError('userId and identity subject are required');
    }
    if (!(verifiedAt instanceof Date) || Number.isNaN(verifiedAt.getTime())) {
      throw new TypeError('verifiedAt must be a valid date');
    }

    try {
      return await this.identityProviders.save(
        this.identityProviders.create({
          userId,
          provider,
          subject: subject.trim(),
          verifiedAt,
        }),
      );
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Identity is already linked');
      }
      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23505'
    );
  }
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity.js';

export const IdentityProviderType = {
  Email: 'Email',
  Google: 'Google',
  Apple: 'Apple',
  Wallet: 'Wallet',
} as const;

export type IdentityProviderType =
  (typeof IdentityProviderType)[keyof typeof IdentityProviderType];

@Entity('identity_providers')
@Index(
  'UQ_identity_providers_provider_subject',
  ['provider', 'subject'],
  { unique: true },
)
export class IdentityProviderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.identities, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 24 })
  provider!: IdentityProviderType;

  @Column({ type: 'varchar', length: 320 })
  subject!: string;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

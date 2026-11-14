import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { IdentityProviderEntity } from './identity-provider.entity.js';

export const UserStatus = {
  Active: 'Active',
  Suspended: 'Suspended',
  Deactivated: 'Deactivated',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 160 })
  displayName!: string;

  @Column({ type: 'varchar', length: 16, default: UserStatus.Active })
  status!: UserStatus;

  @Column({ type: 'varchar', length: 16, default: 'en' })
  locale!: string;

  @VersionColumn({ type: 'integer' })
  stateVersion!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => IdentityProviderEntity, (identity) => identity.user)
  identities!: IdentityProviderEntity[];
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrganizationEntity } from './organization.entity.js';
import { UserEntity } from '../identity/user.entity.js';
import type { OrganizationRole } from '../domain/authorization/authorization.js';

export const OrganizationMembershipStatus = {
  Invited: 'Invited',
  Active: 'Active',
  Suspended: 'Suspended',
  Revoked: 'Revoked',
} as const;

export type OrganizationMembershipStatus =
  (typeof OrganizationMembershipStatus)[keyof typeof OrganizationMembershipStatus];

@Entity('organization_memberships')
@Index('IX_organization_memberships_pair', ['organizationId', 'userId'])
@Index(
  'UQ_organization_memberships_active_pair',
  ['organizationId', 'userId'],
  {
    unique: true,
    where: "\"status\" IN ('Invited', 'Active', 'Suspended')",
  },
)
export class OrganizationMembershipEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization!: OrganizationEntity;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 24 })
  role!: OrganizationRole;

  @Column({ type: 'varchar', length: 16 })
  status!: OrganizationMembershipStatus;

  @Column({ type: 'uuid' })
  invitedByUserId!: string;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

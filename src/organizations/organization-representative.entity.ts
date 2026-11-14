import {
  CreateDateColumn,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrganizationEntity } from './organization.entity.js';
import { UserEntity } from '../identity/user.entity.js';

@Entity('organization_representatives')
@Index(
  'IX_organization_representatives_active',
  ['organizationId', 'userId', 'expiresAt'],
  { where: '"revokedAt" IS NULL' },
)
export class OrganizationRepresentativeEntity {
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

  @Column({ type: 'uuid' })
  verifiedByUserId!: string;

  @Column({ type: 'timestamptz' })
  verifiedAt!: Date;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'varchar', length: 500 })
  verificationReference!: string;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  revokedByUserId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  revocationReason!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

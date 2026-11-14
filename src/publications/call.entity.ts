import { Column, Entity, Index } from 'typeorm';
import { BaseAggregateEntity } from '../database/persistence/base-aggregate.entity.js';
import type { PublicationSnapshot } from './publication.types.js';

@Entity('calls')
@Index('IDX_calls_public_feed', [
  'visibility',
  'lifecycleStatus',
  'publishedAt',
])
export class CallEntity extends BaseAggregateEntity {
  @Column({ type: 'uuid', nullable: true })
  ownerOrganizationId?: string;

  @Column({ type: 'uuid', nullable: true })
  ownerUserId?: string;

  @Column({ type: 'varchar', length: 240 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 24 })
  direction!: string;

  @Column({ type: 'varchar', length: 16, default: 'Private' })
  visibility!: string;

  @Column({ type: 'varchar', length: 16, default: 'Draft' })
  lifecycleStatus!: string;

  @Column({ type: 'varchar', length: 16, default: 'Open' })
  intakeStatus!: string;

  @Column({ type: 'numeric', precision: 78, scale: 0, nullable: true })
  fundingTargetAmount?: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  targetAsset?: string;

  @Column({ type: 'boolean', default: false })
  hardCapEnabled!: boolean;

  @Column({ type: 'numeric', precision: 78, scale: 0, nullable: true })
  hardCapAmount?: string;

  @Column({ type: 'integer', nullable: true })
  maximumAwards?: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  allocationMode?: string;

  @Column({ type: 'numeric', precision: 78, scale: 0, nullable: true })
  fixedAwardAmount?: string;

  @Column({ type: 'numeric', precision: 78, scale: 0, nullable: true })
  overallBudget?: string;

  @Column({ type: 'timestamptz', nullable: true })
  intakeOpensAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  intakeClosesAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt?: Date;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  content!: PublicationSnapshot;
}

@Entity('call_versions')
@Index('UQ_call_versions_number', ['callId', 'version'], { unique: true })
export class CallVersionEntity {
  @Column({ type: 'uuid', primary: true, generated: 'uuid' })
  id!: string;

  @Column({ type: 'uuid' })
  callId!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'jsonb' })
  snapshot!: PublicationSnapshot;

  @Column({ type: 'varchar', length: 32 })
  reason!: string;

  @Column({ type: 'char', length: 64 })
  contentHash!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  publishedAt!: Date;
}

import { Column, Entity, Index } from 'typeorm';
import { BaseAggregateEntity } from '../database/persistence/base-aggregate.entity.js';
import type { PublicationSnapshot } from './publication.types.js';

@Entity('projects')
@Index('IDX_projects_public_feed', [
  'visibility',
  'lifecycleStatus',
  'publishedAt',
])
export class ProjectEntity extends BaseAggregateEntity {
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

  @Column({ type: 'timestamptz', nullable: true })
  intakeOpensAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  intakeClosesAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt?: Date;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  content!: PublicationSnapshot;
}

@Entity('project_versions')
@Index('UQ_project_versions_number', ['projectId', 'version'], { unique: true })
export class ProjectVersionEntity {
  @Column({ type: 'uuid', primary: true, generated: 'uuid' })
  id!: string;

  @Column({ type: 'uuid' })
  projectId!: string;

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

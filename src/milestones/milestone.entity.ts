import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('milestones')
@Index('UQ_milestones_award_sequence', ['awardId', 'sequence'], {
  unique: true,
})
export class MilestoneEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  awardId!: string;

  @Column({ type: 'integer' })
  sequence!: number;

  @Column({ type: 'integer', default: 0 })
  currentTermsVersion!: number;

  @Column({ type: 'integer', default: 1 })
  stateVersion!: number;

  @Column({ type: 'varchar', length: 24, default: 'Pending' })
  status!: string;

  @Column({ type: 'uuid', nullable: true })
  reviewerUserId!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  onChainMilestoneId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity('milestone_terms_versions')
@Index('UQ_milestone_terms_version', ['milestoneId', 'version'], {
  unique: true,
})
export class MilestoneTermsVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  milestoneId!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'jsonb' })
  acceptanceCriteria!: Record<string, unknown>;

  @Column({ type: 'numeric', precision: 78, scale: 0 })
  amount!: string;

  @Column({ type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  reviewerUserId!: string | null;

  @Column({ type: 'uuid' })
  createdByUserId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

@Entity('evidence_submissions')
@Index(
  'UQ_evidence_submissions_milestone_version',
  ['milestoneId', 'version'],
  {
    unique: true,
  },
)
export class EvidenceSubmissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  milestoneId!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'uuid' })
  submittedByUserId!: string;

  @Column({ type: 'varchar', length: 24, default: 'Submitted' })
  status!: 'PendingUpload' | 'Scanning' | 'Submitted' | 'Quarantined' | 'Withdrawn' | 'ChangesRequested' | 'Superseded';

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

@Entity('evidence_assets')
@Index('UQ_evidence_assets_storage_key', ['storageKey'], { unique: true })
export class EvidenceAssetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  evidenceSubmissionId!: string;

  @Column({ type: 'varchar', length: 512 })
  storageKey!: string;

  @Column({ type: 'varchar', length: 64 })
  checksumSha256!: string;

  @Column({ type: 'varchar', length: 255 })
  mimeType!: string;

  @Column({ type: 'bigint' })
  sizeBytes!: string;

  @Column({ type: 'varchar', length: 16, default: 'Private' })
  visibility!: string;

  @Column({ type: 'varchar', length: 16, default: 'Pending' })
  scanStatus!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

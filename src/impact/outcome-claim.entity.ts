import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export const OutcomeClaimProvenance = {
  SelfReported: 'SelfReported',
  Reviewed: 'Reviewed',
  IndependentlyVerified: 'IndependentlyVerified',
} as const;

export type OutcomeClaimProvenance =
  (typeof OutcomeClaimProvenance)[keyof typeof OutcomeClaimProvenance];

@Entity('outcome_claims')
@Index('IDX_outcome_claims_source', ['sourceType', 'sourceId', 'createdAt'])
@Index('IDX_outcome_claims_claimant', ['claimedByUserId', 'createdAt'])
export class OutcomeClaimEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 24 })
  sourceType!: 'Project' | 'Call';

  @Column({ type: 'uuid' })
  sourceId!: string;

  @Column({ type: 'uuid' })
  claimedByUserId!: string;

  @Column({ type: 'varchar', length: 64 })
  metricType!: string;

  @Column({ type: 'varchar', length: 96 })
  value!: string;

  @Column({ type: 'varchar', length: 32 })
  unit!: string;

  @Column({ type: 'varchar', length: 512 })
  evidenceStorageKey!: string;

  @Column({ type: 'varchar', length: 64 })
  evidenceSha256!: string;

  @Column({ type: 'varchar', length: 24, default: OutcomeClaimProvenance.SelfReported })
  provenance!: OutcomeClaimProvenance;

  @Column({ type: 'uuid', nullable: true })
  verifierUserId!: string | null;

  @Column({ type: 'varchar', length: 1_000, nullable: true })
  verificationNote!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

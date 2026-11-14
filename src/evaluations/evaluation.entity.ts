import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('evaluation_rounds')
@Index(
  'UQ_evaluation_rounds_source_stage_rubric',
  ['sourceType', 'sourceId', 'stage', 'rubricVersion'],
  { unique: true },
)
export class EvaluationRoundEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  sourceType!: string;

  @Column({ type: 'uuid' })
  sourceId!: string;

  @Column({ type: 'varchar', length: 48 })
  stage!: string;

  @Column({ type: 'integer' })
  rubricVersion!: number;

  @Column({ type: 'jsonb' })
  rubric!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: 'Open' })
  status!: string;

  @Column({ type: 'uuid' })
  createdByUserId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

@Entity('evaluation_assignments')
@Index(
  'UQ_evaluation_assignments_round_application_reviewer',
  ['roundId', 'applicationId', 'evaluatorUserId'],
  { unique: true, where: '"applicationId" IS NOT NULL' },
)
@Index(
  'UQ_evaluation_assignments_round_funding_offer_reviewer',
  ['roundId', 'fundingOfferId', 'evaluatorUserId'],
  { unique: true, where: '"fundingOfferId" IS NOT NULL' },
)
@Index('IDX_evaluation_assignments_reviewer_status', [
  'evaluatorUserId',
  'status',
])
export class EvaluationAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  roundId!: string;

  @Column({ type: 'uuid' })
  evaluatorUserId!: string;

  @Column({ type: 'uuid', nullable: true })
  applicationId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  fundingOfferId!: string | null;

  @Column({ type: 'varchar', length: 24, default: 'Pending' })
  conflictStatus!: string;

  @Column({ type: 'text', nullable: true })
  conflictReason!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  conflictDeclaredAt!: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'Assigned' })
  status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

@Entity('evaluations')
@Index('UQ_evaluations_assignment_version', ['assignmentId', 'version'], {
  unique: true,
})
export class EvaluationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  assignmentId!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'jsonb' })
  findings!: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  rubricScores!: Record<string, number>;

  @Column({ type: 'varchar', length: 32 })
  eligibilityDecision!: string;

  @Column({ type: 'jsonb', nullable: true })
  deterministicEligibility!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 32 })
  recommendation!: string;

  @Column({ type: 'text' })
  notes!: string;

  @Column({ type: 'uuid' })
  submittedByUserId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  submittedAt!: Date;
}

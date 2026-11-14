import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('applications')
@Index('UQ_applications_receipt', ['receipt'], { unique: true })
@Index('IDX_applications_applicant', [
  'sourceType',
  'sourceId',
  'applicantKey',
  'status',
])
export class ApplicationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  sourceType!: string;

  @Column({ type: 'uuid' })
  sourceId!: string;

  @Column({ type: 'uuid', nullable: true })
  applicantOrganizationId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  applicantUserId!: string | null;

  @Column({ type: 'varchar', length: 96 })
  applicantKey!: string;

  @Column({ type: 'uuid', nullable: true })
  referencedProjectId!: string | null;

  @Column({ type: 'integer' })
  sourceVersion!: number;

  @Column({ type: 'jsonb' })
  sourceSnapshot!: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  applicantSnapshot!: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  proposalSnapshot!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 24 })
  status!: string;

  @Column({ type: 'varchar', length: 36 })
  receipt!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  submittedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  withdrawnAt!: Date | null;
}

@Entity('application_answers')
@Index('UQ_application_answers_question', ['applicationId', 'questionKey'], {
  unique: true,
})
export class ApplicationAnswerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  applicationId!: string;

  @Column({ type: 'varchar', length: 80 })
  questionKey!: string;

  @Column({ type: 'jsonb' })
  answer!: unknown;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  attachmentIds!: string[];

  @Column({ type: 'varchar', length: 16, default: 'NotRequired' })
  fileScanStatus!: string;
}

@Entity('funding_offers')
@Index('IDX_funding_offers_source_status', ['sourceType', 'sourceId', 'status'])
export class FundingOfferEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  sourceType!: string;

  @Column({ type: 'uuid' })
  sourceId!: string;

  @Column({ type: 'uuid', nullable: true })
  funderOrganizationId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  funderUserId!: string | null;

  @Column({ type: 'numeric', precision: 78, scale: 0, nullable: true })
  amount!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  asset!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  supportDescription!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  supportType!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  restrictedPurpose!: string | null;

  @Column({ type: 'jsonb' })
  conditionsSnapshot!: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  sourceSnapshot!: Record<string, unknown>;

  @Column({ type: 'integer' })
  sourceVersion!: number;

  @Column({ type: 'varchar', length: 24 })
  status!: string;

  @Column({ type: 'varchar', length: 36 })
  receipt!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  submittedAt!: Date;

  @Column({ type: 'uuid', nullable: true })
  reviewedByUserId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;
}

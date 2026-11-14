import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AIReviewSourceReference = Readonly<{
  sourceType:
    'Application' | 'Source' | 'Applicant' | 'Proposal' | 'Answer' | 'Document';
  sourceId: string;
  fieldPath: string;
  documentId?: string;
}>;

export type AIReviewAdvisoryOutput = Readonly<{
  summary: string;
  observations: string[];
}>;

@Entity('ai_reviews')
@Index('IDX_ai_reviews_application_created', ['applicationId', 'createdAt'])
export class AIReviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  applicationId!: string;

  @Column({ type: 'uuid' })
  consentId!: string;

  @Column({ type: 'varchar', length: 80 })
  modelProvider!: string;

  @Column({ type: 'varchar', length: 120 })
  modelName!: string;

  @Column({ type: 'varchar', length: 80 })
  modelVersion!: string;

  @Column({ type: 'varchar', length: 80 })
  promptVersion!: string;

  @Column({ type: 'jsonb' })
  citedSources!: AIReviewSourceReference[];

  @Column({ type: 'text', array: true })
  uncertaintyFlags!: string[];

  @Column({ type: 'jsonb' })
  advisoryOutput!: AIReviewAdvisoryOutput;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz' })
  retentionUntil!: Date;
}

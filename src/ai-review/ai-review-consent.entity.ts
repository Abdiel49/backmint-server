import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('ai_review_consents')
@Index('IDX_ai_review_consents_application_user', ['applicationId', 'userId'])
export class AIReviewConsentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  applicationId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 32 })
  policyVersion!: string;

  @Column({ type: 'integer' })
  retentionDays!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  grantedAt!: Date;

  @Column({ type: 'timestamptz' })
  retentionUntil!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  withdrawnAt!: Date | null;
}

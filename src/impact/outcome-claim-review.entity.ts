import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('outcome_claim_reviews')
@Index('IDX_outcome_claim_reviews_claim', ['outcomeClaimId', 'createdAt'])
export class OutcomeClaimReviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  outcomeClaimId!: string;

  @Column({ type: 'uuid' })
  reviewerUserId!: string;

  @Column({ type: 'varchar', length: 24 })
  provenance!: 'Reviewed' | 'IndependentlyVerified';

  @Column({ type: 'varchar', length: 1_000 })
  note!: string;

  @Column({ type: 'varchar', length: 128 })
  correlationId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

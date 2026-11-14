import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('milestone_reviews')
@Index('UQ_milestone_reviews_evidence_version', ['milestoneId', 'evidenceVersion'], { unique: true })
export class MilestoneReviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  milestoneId!: string;

  @Column({ type: 'integer' })
  evidenceVersion!: number;

  @Column({ type: 'uuid' })
  reviewerUserId!: string;

  @Column({ type: 'varchar', length: 24 })
  verdict!: 'Approved' | 'Rejected' | 'ChangesRequested';

  @Column({ type: 'varchar', length: 1000 })
  notes!: string;

  @Column({ type: 'varchar', length: 64 })
  evidenceHash!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  decidedAt!: Date;
}

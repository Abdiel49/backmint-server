import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { VerificationCaseEntity } from './verification-case.entity.js';

@Entity('verification_reviews')
export class VerificationReviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  verificationCaseId!: string;

  @ManyToOne(
    () => VerificationCaseEntity,
    (verificationCase) => verificationCase.reviews,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'verificationCaseId' })
  verificationCase!: VerificationCaseEntity;

  @Column({ type: 'uuid' })
  reviewerUserId!: string;

  @Column({ type: 'varchar', length: 16 })
  decision!: 'NeedsInfo' | 'Verified' | 'Rejected';

  @Column({ type: 'text' })
  reason!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

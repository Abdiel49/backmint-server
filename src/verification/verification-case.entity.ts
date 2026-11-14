import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { VerificationDocumentEntity } from './verification-document.entity.js';
import { VerificationReviewEntity } from './verification-review.entity.js';

export const VerificationStatus = {
  NotStarted: 'NotStarted',
  Pending: 'Pending',
  NeedsInfo: 'NeedsInfo',
  Verified: 'Verified',
  Rejected: 'Rejected',
  Expired: 'Expired',
  Revoked: 'Revoked',
} as const;

export type VerificationStatus =
  (typeof VerificationStatus)[keyof typeof VerificationStatus];

@Entity('verification_cases')
@Index('UQ_verification_cases_organization', ['organizationId'], {
  unique: true,
})
export class VerificationCaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  organizationId!: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: VerificationStatus.NotStarted,
  })
  status!: VerificationStatus;

  @Column({ type: 'uuid' })
  createdByUserId!: string;

  @Column({ type: 'uuid', nullable: true })
  decidedByUserId!: string | null;

  @Column({ type: 'text', nullable: true })
  decisionReason!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @VersionColumn({ type: 'integer' })
  stateVersion!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(
    () => VerificationDocumentEntity,
    (document) => document.verificationCase,
  )
  documents!: VerificationDocumentEntity[];

  @OneToMany(
    () => VerificationReviewEntity,
    (review) => review.verificationCase,
  )
  reviews!: VerificationReviewEntity[];
}

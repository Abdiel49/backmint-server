import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { VerificationCaseEntity } from './verification-case.entity.js';

export const VerificationDocumentScanStatus = {
  PendingUpload: 'PendingUpload',
  Queued: 'Queued',
  Scanning: 'Scanning',
  Passed: 'Passed',
  Infected: 'Infected',
  Quarantined: 'Quarantined',
} as const;

export type VerificationDocumentScanStatus =
  (typeof VerificationDocumentScanStatus)[keyof typeof VerificationDocumentScanStatus];

@Entity('verification_documents')
export class VerificationDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  verificationCaseId!: string;

  @ManyToOne(
    'VerificationCaseEntity',
    (verificationCase: VerificationCaseEntity) => verificationCase.documents,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'verificationCaseId' })
  verificationCase!: VerificationCaseEntity;

  @Column({ type: 'varchar', length: 512, unique: true })
  objectKey!: string;

  @Column({ type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ type: 'varchar', length: 160 })
  contentType!: string;

  @Column({ type: 'integer' })
  contentLength!: number;

  @Column({ type: 'varchar', length: 44 })
  checksumSha256!: string;

  @Column({ type: 'uuid' })
  uploadedByUserId!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: VerificationDocumentScanStatus.PendingUpload,
  })
  scanStatus!: VerificationDocumentScanStatus;

  @Column({ type: 'integer', default: 0 })
  scanAttempts!: number;

  @Column({ type: 'text', nullable: true })
  scanFailure!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  uploadedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  scannedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

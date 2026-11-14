import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { VerificationCaseEntity } from './verification-case.entity.js';

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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

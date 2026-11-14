import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('application_attachments')
export class ApplicationAttachmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  uploadedByUserId!: string;

  @Column({ type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ type: 'varchar', length: 1024, unique: true })
  storageKey!: string;

  @Column({ type: 'varchar', length: 255 })
  mimeType!: string;

  @Column({ type: 'bigint' })
  sizeBytes!: string;

  @Column({ type: 'varchar', length: 64 })
  checksumSha256!: string;

  @Column({ type: 'varchar', length: 24, default: 'PendingUpload' })
  status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

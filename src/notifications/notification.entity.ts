import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from '../identity/user.entity.js';

export const NotificationProcessingStatus = {
  Pending: 'Pending',
  Processed: 'Processed',
  Retrying: 'Retrying',
  Failed: 'Failed',
} as const;

export type NotificationProcessingStatus =
  (typeof NotificationProcessingStatus)[keyof typeof NotificationProcessingStatus];

export const NotificationEmailStatus = {
  NotRequested: 'NotRequested',
  NotConfigured: 'NotConfigured',
} as const;

export type NotificationEmailStatus =
  (typeof NotificationEmailStatus)[keyof typeof NotificationEmailStatus];

@Entity('notifications')
@Index('UQ_notifications_user_idempotency_key', ['userId', 'idempotencyKey'], {
  unique: true,
})
@Index('IDX_notifications_user_created_at', ['userId', 'createdAt'])
@Index('IDX_notifications_delivery_status', ['processingStatus', 'updatedAt'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 160 })
  idempotencyKey!: string;

  @Column({ type: 'varchar', length: 100 })
  category!: string;

  @Column({ type: 'varchar', length: 240 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'jsonb', default: {} })
  data!: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  inboxEnabled!: boolean;

  @Column({ type: 'boolean', default: false })
  emailEnabled!: boolean;

  @Column({ type: 'varchar', length: 24, default: 'NotRequested' })
  emailStatus!: NotificationEmailStatus;

  @Column({ type: 'varchar', length: 24, default: 'Pending' })
  processingStatus!: NotificationProcessingStatus;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ type: 'text', nullable: true })
  lastFailure!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('idempotency_records')
@Index('UQ_idempotency_records_scope_key', ['scope', 'key'], { unique: true })
@Index('IDX_idempotency_records_expiration', ['expiresAt'])
export class IdempotencyRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'scope', type: 'varchar', length: 160 })
  scope!: string;

  @Column({ name: 'key', type: 'varchar', length: 255 })
  key!: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({ name: 'state', type: 'varchar', length: 16 })
  state!: 'InProgress' | 'Completed';

  @Column({ name: 'response', type: 'jsonb', nullable: true })
  response!: unknown;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('audit_events')
@Index('IDX_audit_events_target', ['targetType', 'targetId', 'occurredAt'])
@Index('IDX_audit_events_actor', ['actorUserId', 'occurredAt'])
export class AuditEventEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'action', type: 'varchar', length: 128 })
  action!: string;

  @Column({ name: 'outcome', type: 'varchar', length: 16 })
  outcome!: 'Allowed' | 'Denied' | 'Failed';

  @Column({ name: 'target_type', type: 'varchar', length: 64 })
  targetType!: string;

  @Column({ name: 'target_id', type: 'varchar', length: 128 })
  targetId!: string;

  @Column({ name: 'actor_user_id', type: 'uuid' })
  actorUserId!: string;

  @Column({ name: 'acting_organization_id', type: 'uuid', nullable: true })
  actingOrganizationId!: string | null;

  @Column({ name: 'membership_role', type: 'varchar', length: 32, nullable: true })
  membershipRole!: string | null;

  @Column({ name: 'correlation_id', type: 'varchar', length: 128 })
  correlationId!: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ name: 'before_hash', type: 'varchar', length: 64, nullable: true })
  beforeHash!: string | null;

  @Column({ name: 'after_hash', type: 'varchar', length: 64, nullable: true })
  afterHash!: string | null;

  @Column({ name: 'reason_code', type: 'varchar', length: 128, nullable: true })
  reasonCode!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

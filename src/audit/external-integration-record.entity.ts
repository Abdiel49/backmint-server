import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('external_integration_records')
@Index(
  'UQ_external_integrations_provider_operation_key',
  ['provider', 'operation', 'idempotencyKey'],
  { unique: true },
)
export class ExternalIntegrationRecordEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 96 })
  provider!: string;

  @Column({ type: 'varchar', length: 128 })
  operation!: string;

  @Column({ type: 'varchar', length: 255 })
  idempotencyKey!: string;

  @Column({ type: 'varchar', length: 128 })
  correlationId!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  causationId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({ type: 'varchar', length: 16 })
  state!: 'Pending' | 'Submitted' | 'Confirmed' | 'Failed' | 'Unknown';

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalReference!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  errorCode!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

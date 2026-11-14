import {
  CreateDateColumn,
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const ChainExecutionObservationResult = {
  Succeeded: 'Succeeded',
  Failed: 'Failed',
} as const;

export type ChainExecutionObservationResult =
  (typeof ChainExecutionObservationResult)[keyof typeof ChainExecutionObservationResult];

@Entity('chain_operation_observations')
@Index(
  'UQ_chain_operation_observations_operation_tx',
  ['chainOperationId', 'transactionHash'],
  { unique: true },
)
export class ChainOperationObservationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  chainOperationId!: string;

  @Column({ type: 'varchar', length: 32 })
  network!: string;

  @Column({ type: 'varchar', length: 128 })
  transactionHash!: string;

  @Column({ type: 'varchar', length: 64 })
  signerAccountId!: string;

  @Column({ type: 'varchar', length: 16 })
  result!: ChainExecutionObservationResult;

  @Column({ type: 'varchar', length: 128 })
  blockHash!: string;

  @Column({ type: 'jsonb' })
  executionStatus!: Record<string, unknown> | string;

  @CreateDateColumn({ type: 'timestamptz' })
  observedAt!: Date;
}

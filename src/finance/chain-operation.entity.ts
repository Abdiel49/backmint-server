import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const ChainOperationStatus = {
  IntentReady: 'IntentReady',
  Submitted: 'Submitted',
  Confirmed: 'Confirmed',
  Failed: 'Failed',
  Unknown: 'Unknown',
} as const;

export type ChainOperationStatus =
  (typeof ChainOperationStatus)[keyof typeof ChainOperationStatus];

export type UnsignedContractCallIntent = {
  network: string;
  receiverId: string;
  methodName: string;
  argsBase64: string;
  gas: string;
  deposit: string;
};

@Entity('chain_operations')
@Index('UQ_chain_operations_requester_key', ['requestedBy', 'idempotencyKey'], {
  unique: true,
})
@Index('IDX_chain_operations_status_updated', ['status', 'updatedAt'])
export class ChainOperationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  idempotencyKey!: string;

  @Column({ type: 'varchar', length: 64 })
  operationType!: string;

  @Column({ type: 'integer', default: 1 })
  stateVersion!: number;

  @Column({ type: 'varchar', length: 64 })
  payloadHash!: string;

  @Column({ type: 'uuid' })
  requestedBy!: string;

  @Column({ type: 'varchar', length: 128 })
  correlationId!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: ChainOperationStatus;

  @Column({ type: 'jsonb' })
  intent!: UnsignedContractCallIntent;

  @Column({ type: 'varchar', length: 128, nullable: true })
  transactionHash!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  errorCode!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

import {
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

@Entity('agreement_acceptance_challenges')
@Index('UQ_agreement_acceptance_challenges_nonce_hash', ['nonceHash'], {
  unique: true,
})
@Index('IDX_agreement_acceptance_challenges_user_expiry', [
  'userId',
  'expiresAt',
])
export class AgreementAcceptanceChallengeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  agreementId!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'varchar', length: 64 })
  termsHash!: string;

  @Column({ type: 'varchar', length: 80 })
  partyKey!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  walletLinkId!: string;

  @Column({ type: 'varchar', length: 64 })
  accountId!: string;

  @Column({ type: 'varchar', length: 96 })
  publicKey!: string;

  @Column({ type: 'varchar', length: 128 })
  network!: string;

  @Column({ type: 'varchar', length: 255 })
  recipient!: string;

  @Column({ type: 'varchar', length: 64 })
  nonceHash!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

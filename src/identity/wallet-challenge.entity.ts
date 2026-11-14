import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';
import { UserEntity } from './user.entity.js';

@Entity('wallet_challenges')
@Index('UQ_wallet_challenges_nonce_hash', ['nonceHash'], { unique: true })
export class WalletChallengeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 64 })
  accountId!: string;

  @Column({ type: 'varchar', length: 255 })
  message!: string;

  @Column({ type: 'varchar', length: 64 })
  nonceHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

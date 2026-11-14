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

@Entity('wallet_links')
@Index('UQ_wallet_links_active_account', ['network', 'accountId'], {
  unique: true,
  where: '"revokedAt" IS NULL',
})
export class WalletLinkEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 64 })
  accountId!: string;

  @Column({ type: 'varchar', length: 16 })
  network!: string;

  @Column({ type: 'varchar', length: 96 })
  publicKey!: string;

  @Column({ type: 'timestamptz' })
  verifiedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

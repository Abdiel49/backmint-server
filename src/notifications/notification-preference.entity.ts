import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';
import { UserEntity } from '../identity/user.entity.js';

@Entity('notification_preferences')
@Index('UQ_notification_preferences_user_category', ['userId', 'category'], {
  unique: true,
})
export class NotificationPreferenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 100 })
  category!: string;

  @Column({ type: 'boolean', default: true })
  inboxEnabled!: boolean;

  @Column({ type: 'boolean', default: false })
  emailEnabled!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

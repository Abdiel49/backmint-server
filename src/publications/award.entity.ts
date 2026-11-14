import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('awards')
@Index('UQ_awards_application', ['applicationId'], {
  unique: true,
  where: '"applicationId" IS NOT NULL',
})
@Index('UQ_awards_funding_offer', ['fundingOfferId'], {
  unique: true,
  where: '"fundingOfferId" IS NOT NULL',
})
@Index('IDX_awards_source_state', ['sourceType', 'sourceId', 'state'])
export class AwardEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  sourceType!: string;

  @Column({ type: 'uuid' })
  sourceId!: string;

  @Column({ type: 'uuid', nullable: true })
  applicationId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  fundingOfferId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  recipientOrganizationId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  recipientUserId!: string | null;

  @Column({ type: 'numeric', precision: 78, scale: 0 })
  allocation!: string;

  @Column({ type: 'varchar', length: 128 })
  asset!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'varchar', length: 16, default: 'Offered' })
  state!: string;

  @Column({ type: 'jsonb' })
  termsSnapshot!: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  releasedAt!: Date | null;
}

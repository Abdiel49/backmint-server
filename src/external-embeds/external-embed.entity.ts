import { Column, Entity, Index } from 'typeorm';
import { BaseAggregateEntity } from '../database/persistence/base-aggregate.entity.js';

export const ExternalEmbedStatus = {
  Active: 'Active',
  Disabled: 'Disabled',
} as const;

export type ExternalEmbedStatus =
  (typeof ExternalEmbedStatus)[keyof typeof ExternalEmbedStatus];

@Entity('external_embeds')
@Index('IDX_external_embeds_host_organization', ['hostOrganizationId'])
export class ExternalEmbedEntity extends BaseAggregateEntity {
  @Column({ type: 'uuid' })
  hostOrganizationId!: string;

  @Column({ type: 'varchar', length: 16 })
  sourceType!: 'Project' | 'Call';

  @Column({ type: 'uuid' })
  sourceId!: string;

  @Column({ type: 'text', array: true })
  allowedOrigins!: string[];

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  theme!: Record<string, string>;

  @Column({ type: 'varchar', length: 16 })
  mode!: 'Card' | 'List' | 'Link';

  @Column({ type: 'varchar', length: 16, default: 'Disabled' })
  status!: ExternalEmbedStatus;

  @Column({ type: 'varchar', length: 32, default: 'v1' })
  scriptVersion!: string;
}

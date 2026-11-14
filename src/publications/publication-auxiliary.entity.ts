import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('eligibility_rules')
@Index(
  'UQ_eligibility_rules_version',
  ['sourceType', 'sourceId', 'ruleVersion'],
  { unique: true },
)
export class EligibilityRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  sourceType!: string;

  @Column({ type: 'uuid' })
  sourceId!: string;

  @Column({ type: 'jsonb' })
  definition!: Record<string, unknown>;

  @Column({ type: 'integer', default: 1 })
  ruleVersion!: number;
}

@Entity('questionnaires')
@Index('UQ_questionnaires_version', ['sourceType', 'sourceId', 'version'], {
  unique: true,
})
export class QuestionnaireEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  sourceType!: string;

  @Column({ type: 'uuid' })
  sourceId!: string;

  @Column({ type: 'integer' })
  version!: number;
}

@Entity('questions')
@Index(
  'UQ_questions_questionnaire_order',
  ['questionnaireId', 'displayOrder'],
  { unique: true },
)
export class QuestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  questionnaireId!: string;

  @Column({ type: 'varchar', length: 80 })
  questionKey!: string;

  @Column({ type: 'varchar', length: 24 })
  kind!: string;

  @Column({ type: 'varchar', length: 500 })
  label!: string;

  @Column({ type: 'boolean', default: false })
  required!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  options?: string[];

  @Column({ type: 'jsonb', nullable: true })
  validation?: Record<string, string | number | boolean>;

  @Column({ type: 'integer' })
  displayOrder!: number;
}

@Entity('opportunity_policies')
@Index('UQ_opportunity_policies_source', ['sourceType', 'sourceId'], {
  unique: true,
})
export class OpportunityPolicyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  sourceType!: string;

  @Column({ type: 'uuid' })
  sourceId!: string;

  @Column({ type: 'jsonb' })
  definition!: Record<string, unknown>;
}

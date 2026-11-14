import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  OrganizationMembershipEntity,
  OrganizationMembershipStatus,
} from '../organizations/organization-membership.entity.js';
import { OrganizationRole } from '../domain/authorization/authorization.js';
import { CallEntity } from './call.entity.js';
import { ProjectEntity } from './project.entity.js';
import {
  EligibilityRuleEntity,
  OpportunityPolicyEntity,
  QuestionEntity,
  QuestionnaireEntity,
} from './publication-auxiliary.entity.js';
import {
  PublicationLifecycle,
  PublicationSourceType,
  type PublicationSnapshot,
} from './publication.types.js';
import type { EligibilityConfigurationDto } from './eligibility-admin.dto.js';
import { validatePublication } from './publication.validation.js';

@Injectable()
export class EligibilityAdminService {
  constructor(private readonly dataSource: DataSource) {}

  async configure(
    sourceType: PublicationSourceType,
    sourceId: string,
    userId: string,
    configuration: EligibilityConfigurationDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(
        sourceType === PublicationSourceType.Project
          ? ProjectEntity
          : CallEntity,
      );
      const source = await repository.findOne({
        where: { id: sourceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!source) throw new NotFoundException(`${sourceType} not found`);
      await this.assertCanManage(manager, source, userId);
      if (source.lifecycleStatus !== PublicationLifecycle.Draft)
        throw new BadRequestException(
          'Eligibility and questionnaire versions are immutable after publication',
        );

      const snapshot = {
        ...source.content,
        eligibilityRule: configuration.eligibilityRule,
        questionnaire: {
          version: (source.content.questionnaire?.version ?? 0) + 1,
          questions: configuration.questionnaire.questions,
        },
        opportunityPolicy: configuration.opportunityPolicy,
      } as PublicationSnapshot;
      validatePublication(snapshot, sourceType);
      source.content = snapshot;
      await repository.save(source);

      const rules = manager.getRepository(EligibilityRuleEntity);
      const latestRule = await rules.findOne({
        where: { sourceType, sourceId },
        order: { ruleVersion: 'DESC' },
      });
      await rules.save(
        rules.create({
          sourceType,
          sourceId,
          definition: configuration.eligibilityRule,
          ruleVersion: (latestRule?.ruleVersion ?? 0) + 1,
        }),
      );
      const questionnaires = manager.getRepository(QuestionnaireEntity);
      const latestQuestionnaire = await questionnaires.findOne({
        where: { sourceType, sourceId },
        order: { version: 'DESC' },
      });
      const questionnaire = await questionnaires.save(
        questionnaires.create({
          sourceType,
          sourceId,
          version: (latestQuestionnaire?.version ?? 0) + 1,
        }),
      );
      await manager.getRepository(QuestionEntity).save(
        configuration.questionnaire.questions.map((question) =>
          manager.create(QuestionEntity, {
            questionnaireId: questionnaire.id,
            questionKey: question.id,
            kind: question.kind,
            label: question.label,
            required: question.required,
            options: question.options,
            validation: question.validation,
            displayOrder: question.displayOrder,
          }),
        ),
      );
      const policies = manager.getRepository(OpportunityPolicyEntity);
      await policies.upsert(
        { sourceType, sourceId, definition: configuration.opportunityPolicy },
        ['sourceType', 'sourceId'],
      );
      return {
        sourceType,
        sourceId,
        eligibilityRuleVersion: latestRule ? latestRule.ruleVersion + 1 : 1,
        questionnaireVersion: questionnaire.version,
        configuration,
      };
    });
  }

  private async assertCanManage(
    manager: import('typeorm').EntityManager,
    source: ProjectEntity | CallEntity,
    userId: string,
  ): Promise<void> {
    if (source.ownerUserId === userId) return;
    if (!source.ownerOrganizationId)
      throw new ForbiddenException('You cannot manage this publication');
    const membership = await manager
      .getRepository(OrganizationMembershipEntity)
      .findOne({
        where: {
          organizationId: source.ownerOrganizationId,
          userId,
          status: OrganizationMembershipStatus.Active,
        },
      });
    const allowedRoles: readonly string[] = [
      OrganizationRole.Owner,
      OrganizationRole.Admin,
      OrganizationRole.ProjectManager,
    ];
    if (!membership || !allowedRoles.includes(membership.role))
      throw new ForbiddenException(
        'Active owner, admin, or project manager membership is required',
      );
  }
}

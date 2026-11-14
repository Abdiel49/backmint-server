import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createVersionedSnapshot } from '../domain/snapshots/versioned-snapshot.js';
import { CallEntity, CallVersionEntity } from './call.entity.js';
import { ProjectEntity, ProjectVersionEntity } from './project.entity.js';
import {
  FundingDirection,
  PublicationIntake,
  PublicationLifecycle,
  PublicationSourceType,
  PublicationVisibility,
  type CreateCallInput,
  type CreateProjectInput,
  type PublicationSnapshot,
  type SubmissionType,
} from './publication.types.js';
import {
  assertSubmissionDirection,
  validatePublication,
} from './publication.validation.js';
import { DataSource, Repository } from 'typeorm';
import {
  domainTransitions,
  DomainState,
  DomainWorkflow,
} from '../domain/domain-state.js';

@Injectable()
export class PublicationService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(CallEntity)
    private readonly calls: Repository<CallEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async createProject(input: CreateProjectInput): Promise<ProjectEntity> {
    const snapshot = this.initialSnapshot(input, PublicationSourceType.Project);
    validatePublication(snapshot, PublicationSourceType.Project);
    return this.projects.save(
      this.projects.create(this.projectColumns(snapshot)),
    );
  }

  async createCall(input: CreateCallInput): Promise<CallEntity> {
    const snapshot = this.initialSnapshot(input, PublicationSourceType.Call);
    validatePublication(snapshot, PublicationSourceType.Call);
    return this.calls.save(this.calls.create(this.callColumns(snapshot)));
  }

  async publishProject(id: string): Promise<ProjectEntity> {
    return this.publish(
      id,
      PublicationSourceType.Project,
    ) as Promise<ProjectEntity>;
  }

  async publishCall(id: string): Promise<CallEntity> {
    return this.publish(id, PublicationSourceType.Call) as Promise<CallEntity>;
  }

  async updateProject(
    id: string,
    changes: Partial<CreateProjectInput>,
  ): Promise<ProjectEntity> {
    return this.update(
      id,
      PublicationSourceType.Project,
      changes,
    ) as Promise<ProjectEntity>;
  }

  async updateCall(
    id: string,
    changes: Partial<CreateCallInput>,
  ): Promise<CallEntity> {
    return this.update(
      id,
      PublicationSourceType.Call,
      changes,
    ) as Promise<CallEntity>;
  }

  async setProjectVisibility(
    id: string,
    visibility: PublicationVisibility,
  ): Promise<ProjectEntity> {
    return this.setVisibility(
      id,
      PublicationSourceType.Project,
      visibility,
    ) as Promise<ProjectEntity>;
  }

  async setCallVisibility(
    id: string,
    visibility: PublicationVisibility,
  ): Promise<CallEntity> {
    return this.setVisibility(
      id,
      PublicationSourceType.Call,
      visibility,
    ) as Promise<CallEntity>;
  }

  async setProjectIntake(
    id: string,
    intakeStatus: PublicationIntake,
  ): Promise<ProjectEntity> {
    return this.setIntake(
      id,
      PublicationSourceType.Project,
      intakeStatus,
    ) as Promise<ProjectEntity>;
  }

  async setCallIntake(
    id: string,
    intakeStatus: PublicationIntake,
  ): Promise<CallEntity> {
    return this.setIntake(
      id,
      PublicationSourceType.Call,
      intakeStatus,
    ) as Promise<CallEntity>;
  }

  async transitionProject(
    id: string,
    next: PublicationLifecycle,
  ): Promise<ProjectEntity> {
    return this.transition(
      id,
      PublicationSourceType.Project,
      next,
    ) as Promise<ProjectEntity>;
  }

  async transitionCall(
    id: string,
    next: PublicationLifecycle,
  ): Promise<CallEntity> {
    return this.transition(
      id,
      PublicationSourceType.Call,
      next,
    ) as Promise<CallEntity>;
  }

  assertSubmissionAllowed(
    direction: FundingDirection,
    submissionType: SubmissionType,
  ): void {
    assertSubmissionDirection(direction, submissionType);
  }

  private initialSnapshot(
    input: CreateProjectInput | CreateCallInput,
    sourceType: PublicationSourceType,
  ): PublicationSnapshot {
    return {
      ...input,
      sourceType,
      lifecycleStatus: PublicationLifecycle.Draft,
      intakeStatus: PublicationIntake.Open,
      hardCapEnabled: input.hardCapEnabled ?? false,
    };
  }

  private projectColumns(
    snapshot: PublicationSnapshot,
  ): Partial<ProjectEntity> {
    return {
      ownerUserId: snapshot.ownerUserId,
      ownerOrganizationId: snapshot.ownerOrganizationId,
      title: snapshot.title.trim(),
      description: snapshot.description.trim(),
      direction: snapshot.direction,
      visibility: snapshot.visibility,
      lifecycleStatus: snapshot.lifecycleStatus,
      intakeStatus: snapshot.intakeStatus,
      fundingTargetAmount: snapshot.fundingTargetAmount,
      targetAsset: snapshot.targetAsset,
      hardCapEnabled: snapshot.hardCapEnabled,
      hardCapAmount: snapshot.hardCapAmount,
      intakeOpensAt: snapshot.intakeOpensAt
        ? new Date(snapshot.intakeOpensAt)
        : undefined,
      intakeClosesAt: snapshot.intakeClosesAt
        ? new Date(snapshot.intakeClosesAt)
        : undefined,
      publishedAt: snapshot.publishedAt
        ? new Date(snapshot.publishedAt)
        : undefined,
      content: snapshot,
    };
  }

  private callColumns(snapshot: PublicationSnapshot): Partial<CallEntity> {
    return {
      ownerUserId: snapshot.ownerUserId,
      ownerOrganizationId: snapshot.ownerOrganizationId,
      title: snapshot.title.trim(),
      description: snapshot.description.trim(),
      direction: snapshot.direction,
      visibility: snapshot.visibility,
      lifecycleStatus: snapshot.lifecycleStatus,
      intakeStatus: snapshot.intakeStatus,
      fundingTargetAmount: snapshot.fundingTargetAmount,
      targetAsset: snapshot.targetAsset,
      hardCapEnabled: snapshot.hardCapEnabled,
      hardCapAmount: snapshot.hardCapAmount,
      maximumAwards: snapshot.maximumAwards,
      allocationMode: snapshot.allocationMode,
      fixedAwardAmount: snapshot.fixedAwardAmount,
      overallBudget: snapshot.overallBudget,
      intakeOpensAt: snapshot.intakeOpensAt
        ? new Date(snapshot.intakeOpensAt)
        : undefined,
      intakeClosesAt: snapshot.intakeClosesAt
        ? new Date(snapshot.intakeClosesAt)
        : undefined,
      publishedAt: snapshot.publishedAt
        ? new Date(snapshot.publishedAt)
        : undefined,
      content: snapshot,
    };
  }

  private async publish(
    id: string,
    type: PublicationSourceType,
  ): Promise<ProjectEntity | CallEntity> {
    return this.dataSource.transaction(async (manager) => {
      const sourceRepository =
        type === PublicationSourceType.Project
          ? manager.getRepository(ProjectEntity)
          : manager.getRepository(CallEntity);
      const current = await sourceRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) throw new NotFoundException(`${type} not found`);
      if (current.lifecycleStatus !== PublicationLifecycle.Draft) {
        throw new BadRequestException(
          'Only a draft publication can be published',
        );
      }

      const snapshot = {
        ...current.content,
        lifecycleStatus: PublicationLifecycle.Published,
        publishedAt: new Date().toISOString(),
      } as PublicationSnapshot;
      validatePublication(snapshot, type);
      const versioned = createVersionedSnapshot(
        { sourceType: type, sourceId: current.id, version: 1 },
        snapshot as unknown as Parameters<typeof createVersionedSnapshot>[1],
      );
      const updated = sourceRepository.merge(current, {
        ...this.columnsFor(type, snapshot),
        lifecycleStatus: PublicationLifecycle.Published,
      });
      const saved = await sourceRepository.save(updated);
      if (type === PublicationSourceType.Project) {
        const versions = manager.getRepository(ProjectVersionEntity);
        await versions.save(
          versions.create({
            projectId: current.id,
            version: 1,
            snapshot: versioned.content as PublicationSnapshot,
            contentHash: versioned.contentHash,
            reason: 'InitialPublication',
          }),
        );
      } else {
        const versions = manager.getRepository(CallVersionEntity);
        await versions.save(
          versions.create({
            callId: current.id,
            version: 1,
            snapshot: versioned.content as PublicationSnapshot,
            contentHash: versioned.contentHash,
            reason: 'InitialPublication',
          }),
        );
      }
      await this.persistAuxiliary(manager, type, current.id, snapshot);
      return saved;
    });
  }

  private async update(
    id: string,
    type: PublicationSourceType,
    changes: Partial<PublicationSnapshot>,
  ): Promise<ProjectEntity | CallEntity> {
    return this.dataSource.transaction(async (manager) => {
      const currentRepository =
        type === PublicationSourceType.Project
          ? manager.getRepository(ProjectEntity)
          : manager.getRepository(CallEntity);
      const locked = await currentRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException(`${type} not found`);
      if (
        locked.lifecycleStatus !== PublicationLifecycle.Draft &&
        locked.lifecycleStatus !== PublicationLifecycle.Published &&
        locked.lifecycleStatus !== PublicationLifecycle.Active
      ) {
        throw new BadRequestException(
          'Only drafts and active publications can be edited',
        );
      }
      const snapshot = {
        ...locked.content,
        ...changes,
        sourceType: type,
      } as PublicationSnapshot;
      validatePublication(snapshot, type);
      const updated = currentRepository.merge(
        locked,
        this.columnsFor(type, snapshot),
      );
      const saved = await currentRepository.save(updated);
      if (
        locked.lifecycleStatus === PublicationLifecycle.Published ||
        locked.lifecycleStatus === PublicationLifecycle.Active
      ) {
        const versionRepository =
          type === PublicationSourceType.Project
            ? manager.getRepository(ProjectVersionEntity)
            : manager.getRepository(CallVersionEntity);
        const latest = await versionRepository
          .createQueryBuilder('version')
          .where(
            type === PublicationSourceType.Project
              ? 'version."projectId" = :id'
              : 'version."callId" = :id',
            { id },
          )
          .orderBy('version.version', 'DESC')
          .getOne();
        const nextVersion = (latest?.version ?? 0) + 1;
        const versioned = createVersionedSnapshot(
          { sourceType: type, sourceId: id, version: nextVersion },
          snapshot as unknown as Parameters<typeof createVersionedSnapshot>[1],
        );
        if (type === PublicationSourceType.Project) {
          const versions = manager.getRepository(ProjectVersionEntity);
          await versions.save(
            versions.create({
              projectId: id,
              version: nextVersion,
              snapshot: versioned.content as PublicationSnapshot,
              contentHash: versioned.contentHash,
              reason: 'PublishedChange',
            }),
          );
        } else {
          const versions = manager.getRepository(CallVersionEntity);
          await versions.save(
            versions.create({
              callId: id,
              version: nextVersion,
              snapshot: versioned.content as PublicationSnapshot,
              contentHash: versioned.contentHash,
              reason: 'PublishedChange',
            }),
          );
        }
      }
      await this.persistAuxiliary(manager, type, id, snapshot);
      return saved;
    });
  }

  private async setVisibility(
    id: string,
    type: PublicationSourceType,
    visibility: PublicationVisibility,
  ): Promise<ProjectEntity | CallEntity> {
    return this.update(id, type, { visibility });
  }

  private async setIntake(
    id: string,
    type: PublicationSourceType,
    intakeStatus: PublicationIntake,
  ): Promise<ProjectEntity | CallEntity> {
    if (!Object.values(PublicationIntake).includes(intakeStatus))
      throw new BadRequestException('Invalid intake status');
    return this.dataSource.transaction(async (manager) => {
      const repository =
        type === PublicationSourceType.Project
          ? manager.getRepository(ProjectEntity)
          : manager.getRepository(CallEntity);
      const source = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!source) throw new NotFoundException(`${type} not found`);
      if (
        source.lifecycleStatus !== PublicationLifecycle.Published &&
        source.lifecycleStatus !== PublicationLifecycle.Active
      ) {
        throw new BadRequestException(
          'Intake can only change for published or active publications',
        );
      }
      source.intakeStatus = intakeStatus;
      return repository.save(source);
    });
  }

  private async transition(
    id: string,
    type: PublicationSourceType,
    next: PublicationLifecycle,
  ): Promise<ProjectEntity | CallEntity> {
    if (!Object.values(PublicationLifecycle).includes(next))
      throw new BadRequestException('Invalid lifecycle status');
    return this.dataSource.transaction(async (manager) => {
      const repository =
        type === PublicationSourceType.Project
          ? manager.getRepository(ProjectEntity)
          : manager.getRepository(CallEntity);
      const source = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!source) throw new NotFoundException(`${type} not found`);
      const allowed =
        domainTransitions[DomainWorkflow.Publication][
          source.lifecycleStatus as DomainState
        ] ?? [];
      if (!allowed.includes(next as DomainState)) {
        throw new BadRequestException(
          `Cannot transition ${type} from ${source.lifecycleStatus} to ${next}`,
        );
      }
      source.lifecycleStatus = next;
      source.content = { ...source.content, lifecycleStatus: next };
      return repository.save(source);
    });
  }

  private async persistAuxiliary(
    manager: import('typeorm').EntityManager,
    type: PublicationSourceType,
    id: string,
    snapshot: PublicationSnapshot,
  ): Promise<void> {
    const {
      EligibilityRuleEntity,
      OpportunityPolicyEntity,
      QuestionEntity,
      QuestionnaireEntity,
    } = await import('./publication-auxiliary.entity.js');
    const rules = manager.getRepository(EligibilityRuleEntity);
    const policies = manager.getRepository(OpportunityPolicyEntity);
    const questionnaires = manager.getRepository(QuestionnaireEntity);
    const questions = manager.getRepository(QuestionEntity);

    if (snapshot.eligibilityRule) {
      const latest = await rules.findOne({
        where: { sourceType: type, sourceId: id },
        order: { ruleVersion: 'DESC' },
      });
      await rules.save(
        rules.create({
          sourceType: type,
          sourceId: id,
          definition: snapshot.eligibilityRule,
          ruleVersion: (latest?.ruleVersion ?? 0) + 1,
        }),
      );
    }

    if (snapshot.opportunityPolicy) {
      await policies.upsert(
        {
          sourceType: type,
          sourceId: id,
          definition: snapshot.opportunityPolicy,
        },
        ['sourceType', 'sourceId'],
      );
    }

    if (snapshot.questionnaire) {
      const latest = await questionnaires.findOne({
        where: { sourceType: type, sourceId: id },
        order: { version: 'DESC' },
      });
      const questionnaire = await questionnaires.save(
        questionnaires.create({
          sourceType: type,
          sourceId: id,
          version: Math.max(
            (latest?.version ?? 0) + 1,
            snapshot.questionnaire.version,
          ),
        }),
      );
      await questions.save(
        snapshot.questionnaire.questions.map((question) =>
          questions.create({
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
    }
  }

  private columnsFor(
    type: PublicationSourceType,
    snapshot: PublicationSnapshot,
  ): Partial<ProjectEntity | CallEntity> {
    return type === PublicationSourceType.Project
      ? this.projectColumns(snapshot)
      : this.callColumns(snapshot);
  }
}

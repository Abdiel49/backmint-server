import { PublicationService } from './publication.service.js';
import {
  EligibilityRuleEntity,
  OpportunityPolicyEntity,
  QuestionEntity,
  QuestionnaireEntity,
} from './publication-auxiliary.entity.js';
import { ProjectEntity, ProjectVersionEntity } from './project.entity.js';
import {
  PublicationIntake,
  PublicationLifecycle,
  PublicationVisibility,
} from './publication.types.js';
import { DataSource, Repository } from 'typeorm';

describe('PublicationService state boundaries', () => {
  const source = {
    id: 'project-1',
    lifecycleStatus: PublicationLifecycle.Published,
    visibility: PublicationVisibility.Public,
    intakeStatus: PublicationIntake.Open,
    content: { title: 'Solar hub' },
  };

  it('changes intake without changing visibility, lifecycle or published content', async () => {
    const save = vi.fn(async (entity) => entity);
    const findOne = vi.fn(async () => source);
    const repository = { findOne, save };
    const manager = { getRepository: vi.fn(() => repository) };
    const dataSource = { transaction: vi.fn((callback) => callback(manager)) };
    const service = new PublicationService(
      {} as Repository<ProjectEntity>,
      {} as never,
      dataSource as unknown as DataSource,
    );

    await service.setProjectIntake('project-1', PublicationIntake.Paused);

    expect(source.intakeStatus).toBe(PublicationIntake.Paused);
    expect(source.visibility).toBe(PublicationVisibility.Public);
    expect(source.lifecycleStatus).toBe(PublicationLifecycle.Published);
    expect(source.content).toEqual({ title: 'Solar hub' });
    expect(save).toHaveBeenCalledOnce();
  });

  it('rejects an illegal lifecycle transition without changing intake or visibility', async () => {
    const findOne = vi.fn(async () => ({
      ...source,
      lifecycleStatus: PublicationLifecycle.Draft,
    }));
    const repository = { findOne, save: vi.fn() };
    const manager = { getRepository: vi.fn(() => repository) };
    const dataSource = { transaction: vi.fn((callback) => callback(manager)) };
    const service = new PublicationService(
      {} as Repository<ProjectEntity>,
      {} as never,
      dataSource as unknown as DataSource,
    );

    await expect(
      service.transitionProject('project-1', PublicationLifecycle.Active),
    ).rejects.toThrow();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('publishes a standalone Project with a versioned immutable snapshot', async () => {
    const snapshot = {
      sourceType: 'Project',
      ownerUserId: 'user-1',
      title: 'Solar hub',
      description: 'A community solar installation',
      direction: 'FundingRequested',
      visibility: PublicationVisibility.Public,
      lifecycleStatus: PublicationLifecycle.Draft,
      intakeStatus: PublicationIntake.Open,
      hardCapEnabled: false,
      objectives: ['Install solar panels'],
    };
    const draft = {
      id: 'project-1',
      ...snapshot,
      content: snapshot,
    };
    const sourceRepository = {
      findOne: vi.fn(async () => draft),
      merge: vi.fn((entity, changes) => Object.assign(entity, changes)),
      save: vi.fn(async (entity) => entity),
    };
    const versionRows: Partial<ProjectVersionEntity>[] = [];
    const versionRepository = {
      create: vi.fn((value) => value),
      save: vi.fn(async (entity) => {
        versionRows.push(entity);
        return entity;
      }),
    };
    const emptyRepository = {};
    const repositories = new Map<unknown, unknown>([
      [ProjectEntity, sourceRepository],
      [ProjectVersionEntity, versionRepository],
      [EligibilityRuleEntity, emptyRepository],
      [QuestionnaireEntity, emptyRepository],
      [QuestionEntity, emptyRepository],
      [OpportunityPolicyEntity, emptyRepository],
    ]);
    const manager = {
      getRepository: vi.fn((entity) => repositories.get(entity)),
    };
    const dataSource = { transaction: vi.fn((callback) => callback(manager)) };
    const service = new PublicationService(
      {} as Repository<ProjectEntity>,
      {} as never,
      dataSource as unknown as DataSource,
    );

    await service.publishProject('project-1');

    expect(draft.lifecycleStatus).toBe(PublicationLifecycle.Published);
    expect(versionRows).toHaveLength(1);
    expect(versionRows[0]).toMatchObject({
      projectId: 'project-1',
      version: 1,
      reason: 'InitialPublication',
      snapshot: {
        title: 'Solar hub',
        lifecycleStatus: PublicationLifecycle.Published,
      },
    });
    expect(versionRows[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

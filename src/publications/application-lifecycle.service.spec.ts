import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ParticipationService } from './participation.service.js';
import {
  ApplicationAnswerEntity,
  ApplicationEntity,
} from './application.entity.js';

describe('Application lifecycle', () => {
  const withdrawnApplication = () => ({
    id: 'application-1',
    applicantUserId: 'user-1',
    applicantOrganizationId: null,
    applicantKey: 'user:user-1',
    sourceType: 'Project',
    sourceId: 'project-1',
    status: 'Withdrawn',
    withdrawnAt: new Date('2026-11-14T10:00:00.000Z'),
    proposalSnapshot: { plan: 'Original submission' },
    sourceSnapshot: { title: 'Original title' },
    applicantSnapshot: { name: 'Applicant' },
    receipt: 'original-receipt',
  });

  it('withdraws an owned eligible Application under a locked transaction', async () => {
    const application = {
      ...withdrawnApplication(),
      status: 'Submitted',
      withdrawnAt: null,
    };
    const query = {
      setLock: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(application),
    };
    const save = vi.fn(async (entity) => entity);
    const repository = { createQueryBuilder: vi.fn(() => query), save };
    const manager = { getRepository: vi.fn(() => repository) };
    const dataSource = { transaction: vi.fn((callback) => callback(manager)) };
    const service = new ParticipationService(dataSource as never);

    const result = await service.withdrawApplication(application.id, 'user-1');

    expect(query.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(result.status).toBe('Withdrawn');
    expect(result.withdrawnAt).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalledOnce();
    expect(application.proposalSnapshot).toEqual({
      plan: 'Original submission',
    });
  });

  it('rejects withdrawal from a terminal or selected state without saving', async () => {
    const application = { ...withdrawnApplication(), status: 'Selected' };
    const repository = {
      createQueryBuilder: vi.fn(() => ({
        setLock: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(application),
      })),
      save: vi.fn(),
    };
    const manager = { getRepository: vi.fn(() => repository) };
    const service = new ParticipationService({
      transaction: (callback) => callback(manager),
    } as never);

    await expect(
      service.withdrawApplication(application.id, 'user-1'),
    ).rejects.toThrow(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('hides organization Applications from inactive or unrelated actors', async () => {
    const application = {
      ...withdrawnApplication(),
      applicantUserId: null,
      applicantOrganizationId: 'organization-1',
      status: 'Submitted',
    };
    const appRepository = {
      createQueryBuilder: vi.fn(() => ({
        setLock: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(application),
      })),
      save: vi.fn(),
    };
    const memberships = { findOne: vi.fn().mockResolvedValue(null) };
    const manager = {
      getRepository: vi.fn((entity) =>
        entity === ApplicationEntity ? appRepository : memberships,
      ),
    };
    const service = new ParticipationService({
      transaction: (callback) => callback(manager),
    } as never);

    await expect(
      service.withdrawApplication(application.id, 'stranger'),
    ).rejects.toThrow(NotFoundException);
    expect(appRepository.save).not.toHaveBeenCalled();
  });

  it('creates a new linked immutable version only when current source policy permits it', async () => {
    const previous = withdrawnApplication();
    const query = {
      setLock: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(previous),
    };
    const appRows: Record<string, unknown>[] = [];
    const applicationRepository = {
      createQueryBuilder: vi.fn(() => query),
      findOneBy: vi.fn().mockResolvedValue(null),
      create: vi.fn((value) => value),
      save: vi.fn(async (value) => {
        const saved = {
          id: 'application-2',
          receipt: 'new-receipt',
          submittedAt: new Date(),
          ...value,
        };
        appRows.push(saved);
        return saved;
      }),
    };
    const answerRepository = {
      create: vi.fn((value) => value),
      save: vi.fn(async (value) => value),
    };
    const versionRepository = {
      findOne: vi.fn().mockResolvedValue({ version: 4 }),
    };
    const manager = {
      getRepository: vi.fn((entity) => {
        if (entity === ApplicationEntity) return applicationRepository;
        if (entity === ApplicationAnswerEntity) return answerRepository;
        return versionRepository;
      }),
    };
    const service = new ParticipationService({
      transaction: (callback) => callback(manager),
    } as never);
    const privateService = service as unknown as Record<
      string,
      ReturnType<typeof vi.fn>
    >;
    privateService.lockSource = vi.fn().mockResolvedValue({
      id: 'project-1',
      content: {
        title: 'Current title',
        opportunityPolicy: { allowReapply: true },
      },
    });
    privateService.assertIntake = vi.fn();
    privateService.loadApplicant = vi
      .fn()
      .mockResolvedValue({ name: 'Applicant' });
    privateService.assertEligibility = vi.fn();
    privateService.assertApplicationQuota = vi.fn();
    privateService.assertAnswers = vi.fn();
    privateService.currentSourceVersion = vi.fn().mockResolvedValue(4);

    const result = await service.resubmitApplication(previous.id, 'user-1', {
      proposal: { plan: 'Updated submission' },
      answers: [{ questionKey: 'community', answer: 'New response' }],
    });

    expect(result.supersedesApplicationId).toBe(previous.id);
    expect(result.receipt).not.toBe(previous.receipt);
    expect(result.sourceVersion).toBe(4);
    expect(previous.proposalSnapshot).toEqual({ plan: 'Original submission' });
    expect(answerRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        applicationId: 'application-2',
        answer: 'New response',
      }),
    ]);
  });

  it('rejects policy-disabled resubmission without creating another version', async () => {
    const previous = withdrawnApplication();
    const query = {
      setLock: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(previous),
    };
    const applicationRepository = {
      createQueryBuilder: vi.fn(() => query),
      findOneBy: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      save: vi.fn(),
    };
    const manager = { getRepository: vi.fn(() => applicationRepository) };
    const service = new ParticipationService({
      transaction: (callback) => callback(manager),
    } as never);
    const privateService = service as unknown as Record<
      string,
      ReturnType<typeof vi.fn>
    >;
    privateService.lockSource = vi.fn().mockResolvedValue({
      id: 'project-1',
      content: { opportunityPolicy: { allowReapply: false } },
    });
    privateService.assertIntake = vi.fn();

    await expect(
      service.resubmitApplication(previous.id, 'user-1', {
        proposal: {},
        answers: [],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(applicationRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a second resubmission linked to the same predecessor', async () => {
    const query = {
      setLock: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(withdrawnApplication()),
    };
    const applicationRepository = {
      createQueryBuilder: vi.fn(() => query),
      findOneBy: vi.fn().mockResolvedValue({ id: 'existing-child' }),
      save: vi.fn(),
    };
    const manager = { getRepository: vi.fn(() => applicationRepository) };
    const service = new ParticipationService({
      transaction: (callback) => callback(manager),
    } as never);

    await expect(
      service.resubmitApplication('application-1', 'user-1', {
        proposal: {},
        answers: [],
      }),
    ).rejects.toThrow(ConflictException);
    expect(applicationRepository.save).not.toHaveBeenCalled();
  });
});

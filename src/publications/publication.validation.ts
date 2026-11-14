import { BadRequestException } from '@nestjs/common';
import {
  FundingDirection,
  PublicationIntake,
  PublicationLifecycle,
  PublicationVisibility,
  SubmissionType,
  type PublicationSnapshot,
} from './publication.types.js';

export function assertSubmissionDirection(
  direction: FundingDirection,
  submissionType: SubmissionType,
): void {
  const expected =
    direction === FundingDirection.FundingOffered
      ? SubmissionType.Application
      : SubmissionType.FundingOffer;

  if (submissionType !== expected) {
    throw new BadRequestException(
      `${direction} publications accept ${expected} submissions only`,
    );
  }
}

export function validatePublication(
  input: PublicationSnapshot,
  sourceType: 'Project' | 'Call',
): void {
  if (!input.title.trim() || !input.description.trim()) {
    throw new BadRequestException('Title and description are required');
  }

  if (!Object.values(FundingDirection).includes(input.direction)) {
    throw new BadRequestException('Invalid funding direction');
  }

  if (!Object.values(PublicationVisibility).includes(input.visibility)) {
    throw new BadRequestException('Invalid visibility');
  }

  if (!Object.values(PublicationLifecycle).includes(input.lifecycleStatus)) {
    throw new BadRequestException('Invalid lifecycle status');
  }

  if (!Object.values(PublicationIntake).includes(input.intakeStatus)) {
    throw new BadRequestException('Invalid intake status');
  }

  if (!input.ownerUserId?.trim() && !input.ownerOrganizationId?.trim()) {
    throw new BadRequestException('A user or organization owner is required');
  }

  if (input.hardCapEnabled && !positiveInteger(input.hardCapAmount)) {
    throw new BadRequestException(
      'An enabled hard cap requires a positive integer amount',
    );
  }

  if (
    input.hardCapEnabled &&
    input.fundingTargetAmount !== undefined &&
    positiveInteger(input.hardCapAmount) &&
    BigInt(input.fundingTargetAmount) > BigInt(input.hardCapAmount)
  ) {
    throw new BadRequestException(
      'Funding target cannot exceed the enabled hard cap',
    );
  }

  if (
    input.fundingTargetAmount !== undefined &&
    !nonNegativeInteger(input.fundingTargetAmount)
  ) {
    throw new BadRequestException(
      'Funding target must be a non-negative integer',
    );
  }

  if (
    (input.fundingTargetAmount !== undefined || input.hardCapEnabled) &&
    !input.targetAsset?.trim()
  ) {
    throw new BadRequestException(
      'Funding targets and hard caps require an asset',
    );
  }

  if (
    input.intakeOpensAt &&
    input.intakeClosesAt &&
    new Date(input.intakeOpensAt) >= new Date(input.intakeClosesAt)
  ) {
    throw new BadRequestException('Intake opening must precede intake closing');
  }

  for (const value of [input.intakeOpensAt, input.intakeClosesAt]) {
    if (value !== undefined && Number.isNaN(new Date(value).getTime())) {
      throw new BadRequestException('Intake dates must be valid timestamps');
    }
  }

  if (sourceType === 'Project') {
    if (!input.objectives?.length) {
      throw new BadRequestException(
        'A Project requires at least one objective',
      );
    }

    for (const cost of input.costs ?? []) {
      if (
        !cost.name.trim() ||
        !cost.asset.trim() ||
        !positiveInteger(cost.amount)
      ) {
        throw new BadRequestException(
          'Project costs require a name, asset and positive integer amount',
        );
      }
    }
  }

  if (sourceType === 'Call') {
    if (
      !input.audienceTypes?.length ||
      input.audienceTypes.some((type) => !type.trim())
    ) {
      throw new BadRequestException('A Call requires a non-empty audience');
    }

    if (
      !input.supportTypes?.length ||
      input.supportTypes.some((type) => !type.trim())
    ) {
      throw new BadRequestException(
        'A Call requires at least one support type',
      );
    }

    if (
      input.maximumAwards !== undefined &&
      (!Number.isSafeInteger(input.maximumAwards) || input.maximumAwards < 1)
    ) {
      throw new BadRequestException(
        'Maximum awards must be a positive integer',
      );
    }

    if (
      input.overallBudget !== undefined &&
      !positiveInteger(input.overallBudget)
    ) {
      throw new BadRequestException(
        'Overall budget must be a positive integer',
      );
    }

    if (
      input.fixedAwardAmount !== undefined &&
      !positiveInteger(input.fixedAwardAmount)
    ) {
      throw new BadRequestException(
        'Fixed award amount must be a positive integer',
      );
    }

    if (
      input.allocationMode === 'Single' &&
      input.maximumAwards !== undefined &&
      input.maximumAwards !== 1
    ) {
      throw new BadRequestException(
        'Single allocation supports exactly one award',
      );
    }

    if (
      input.fixedAwardAmount &&
      input.maximumAwards &&
      input.overallBudget &&
      BigInt(input.fixedAwardAmount) * BigInt(input.maximumAwards) >
        BigInt(input.overallBudget)
    ) {
      throw new BadRequestException('Fixed awards exceed the overall budget');
    }

    if (input.eligibilityRule && !input.eligibilityRule.audienceTypes.length) {
      throw new BadRequestException('Eligibility rules require an audience');
    }

    if (
      input.eligibilityRule?.audienceTypes.some(
        (type) => !input.audienceTypes?.includes(type),
      )
    ) {
      throw new BadRequestException(
        'Eligibility audiences must be included in the Call audience',
      );
    }

    if (input.questionnaire) {
      const ids = new Set<string>();
      const orders = new Set<number>();

      for (const question of input.questionnaire.questions) {
        if (
          !question.id.trim() ||
          !question.label.trim() ||
          ids.has(question.id)
        ) {
          throw new BadRequestException(
            'Question identifiers and labels must be unique and non-empty',
          );
        }

        if (
          !Number.isSafeInteger(question.displayOrder) ||
          question.displayOrder < 0 ||
          orders.has(question.displayOrder)
        ) {
          throw new BadRequestException(
            'Question display order must be unique and non-negative',
          );
        }

        if (
          (question.kind === 'SingleChoice' ||
            question.kind === 'MultipleChoice') &&
          !question.options?.length
        ) {
          throw new BadRequestException(
            'Choice questions require at least one option',
          );
        }

        ids.add(question.id);
        orders.add(question.displayOrder);
      }
    }

    const policy = input.opportunityPolicy;

    for (const count of [
      policy?.maxApplicationsPerApplicant,
      policy?.maxAwards,
    ]) {
      if (count !== undefined && (!Number.isSafeInteger(count) || count < 1)) {
        throw new BadRequestException(
          'Application and award quotas must be positive integers',
        );
      }
    }

    if (
      policy?.selectionWindowOpensAt &&
      policy.selectionWindowClosesAt &&
      new Date(policy.selectionWindowOpensAt) >=
        new Date(policy.selectionWindowClosesAt)
    ) {
      throw new BadRequestException(
        'Selection window opening must precede closing',
      );
    }
  }
}

export function mayAcceptFundingAmount(
  hardCapEnabled: boolean,
  hardCapAmount: string | undefined,
  alreadyAccepted: string,
  proposedAmount: string,
): boolean {
  if (!hardCapEnabled) return true;
  if (
    !hardCapAmount ||
    !nonNegativeInteger(alreadyAccepted) ||
    !positiveInteger(proposedAmount)
  )
    return false;
  return (
    BigInt(alreadyAccepted) + BigInt(proposedAmount) <= BigInt(hardCapAmount)
  );
}

export function shouldCloseIntakeAfterFunding(
  hardCapEnabled: boolean,
  closeIntakeWhenHardCapReached: boolean | undefined,
  hardCapAmount: string | undefined,
  totalAccepted: string,
): boolean {
  return Boolean(
    hardCapEnabled &&
    closeIntakeWhenHardCapReached &&
    hardCapAmount &&
    nonNegativeInteger(totalAccepted) &&
    BigInt(totalAccepted) >= BigInt(hardCapAmount),
  );
}

function positiveInteger(value: string | undefined): value is string {
  return (
    typeof value === 'string' &&
    /^(0|[1-9]\d*)$/.test(value) &&
    BigInt(value) > 0n
  );
}

function nonNegativeInteger(value: string | undefined): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value);
}

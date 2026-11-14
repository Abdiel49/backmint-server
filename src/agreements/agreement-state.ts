import { ConflictException } from '@nestjs/common';
import { AgreementStatus } from './agreement.entity.js';

export const agreementTransitions: Record<
  AgreementStatus,
  readonly AgreementStatus[]
> = {
  [AgreementStatus.Draft]: [
    AgreementStatus.PendingAcceptance,
    AgreementStatus.Cancelled,
  ],
  [AgreementStatus.PendingAcceptance]: [
    AgreementStatus.Accepted,
    AgreementStatus.Cancelled,
    AgreementStatus.Expired,
  ],
  [AgreementStatus.Accepted]: [
    AgreementStatus.AwaitingFunding,
    AgreementStatus.Cancelled,
    AgreementStatus.Disputed,
  ],
  [AgreementStatus.AwaitingFunding]: [
    AgreementStatus.PartiallyFunded,
    AgreementStatus.Funded,
    AgreementStatus.Cancelled,
    AgreementStatus.Disputed,
    AgreementStatus.Expired,
  ],
  [AgreementStatus.PartiallyFunded]: [
    AgreementStatus.Funded,
    AgreementStatus.Cancelled,
    AgreementStatus.Disputed,
  ],
  [AgreementStatus.Funded]: [
    AgreementStatus.Active,
    AgreementStatus.Cancelled,
    AgreementStatus.Disputed,
  ],
  [AgreementStatus.Active]: [
    AgreementStatus.Completed,
    AgreementStatus.Cancelled,
    AgreementStatus.Disputed,
  ],
  [AgreementStatus.Completed]: [],
  [AgreementStatus.Cancelled]: [],
  [AgreementStatus.Disputed]: [
    AgreementStatus.Active,
    AgreementStatus.Completed,
  ],
  [AgreementStatus.Expired]: [],
};

export function assertAgreementTransition(
  from: AgreementStatus,
  to: AgreementStatus,
): void {
  if (!agreementTransitions[from]?.includes(to))
    throw new ConflictException(
      `Invalid Agreement transition: ${from} -> ${to}`,
    );
}

import { AgreementStatus } from './agreement.entity.js';
import {
  agreementTransitions,
  assertAgreementTransition,
} from './agreement-state.js';

describe('Agreement state machine', () => {
  it.each([
    [AgreementStatus.Draft, AgreementStatus.PendingAcceptance],
    [AgreementStatus.PendingAcceptance, AgreementStatus.Accepted],
    [AgreementStatus.Accepted, AgreementStatus.AwaitingFunding],
    [AgreementStatus.AwaitingFunding, AgreementStatus.PartiallyFunded],
    [AgreementStatus.AwaitingFunding, AgreementStatus.Funded],
    [AgreementStatus.PartiallyFunded, AgreementStatus.Funded],
    [AgreementStatus.Funded, AgreementStatus.Active],
    [AgreementStatus.Active, AgreementStatus.Completed],
    [AgreementStatus.Active, AgreementStatus.Disputed],
  ] as const)('allows %s -> %s at the guarded transition layer', (from, to) => {
    expect(() => assertAgreementTransition(from, to)).not.toThrow();
  });

  it.each([
    [AgreementStatus.Draft, AgreementStatus.Active],
    [AgreementStatus.Accepted, AgreementStatus.Funded],
    [AgreementStatus.AwaitingFunding, AgreementStatus.Active],
    [AgreementStatus.PartiallyFunded, AgreementStatus.Active],
    [AgreementStatus.Completed, AgreementStatus.Active],
    [AgreementStatus.Expired, AgreementStatus.Accepted],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(() => assertAgreementTransition(from, to)).toThrow(
      'Invalid Agreement transition',
    );
  });

  it('defines an explicit transition list for every supported state', () => {
    expect(Object.keys(agreementTransitions).sort()).toEqual(
      Object.values(AgreementStatus).sort(),
    );
  });
});

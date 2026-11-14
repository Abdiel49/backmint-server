import {
  validateAgreementTermsShape,
  validateMilestoneAllocationTotal,
} from './agreement-terms-validation.js';
import type { AgreementTerms } from './agreement.entity.js';

const makeTerms = (
  economicTerms: Record<string, unknown> = { allocationBaseUnits: '1' },
): AgreementTerms => ({
  network: 'near:testnet',
  asset: 'usdc.testnet',
  parties: [
    { key: 'recipient', role: 'Recipient', userId: 'user-1', required: true },
    { key: 'funder', role: 'Funder', userId: 'user-2', required: true },
  ],
  milestones: [{ key: 'delivery', releaseAmount: '12' }],
  verificationAuthority: {},
  deadlines: {},
  cancellationPolicy: {},
  disputePolicy: {},
  refundPolicy: {},
  legalTerms: {},
  economicTerms,
});

describe('Agreement terms validation', () => {
  it.each(['-1', '+1', '01', '1.0', '1e3', ' 1', 1, 1.5, null])(
    'rejects non-canonical base-unit amount %s',
    (amount) => {
      expect(() =>
        validateAgreementTermsShape(
          makeTerms({
            paymentSchedule: [{ amountBaseUnits: amount }],
          }),
        ),
      ).toThrow('canonical non-negative integer string');
    },
  );

  it('validates nested milestone allocations and known unit-suffixed amount fields', () => {
    expect(() =>
      validateAgreementTermsShape(
        makeTerms({
          paymentSchedule: [
            { allocation: '100', amountUsd: '250', amount: '350' },
          ],
        }),
      ),
    ).not.toThrow();
    expect(() =>
      validateAgreementTermsShape(
        makeTerms({ paymentSchedule: [{ amountUsdc: '0' }] }),
      ),
    ).not.toThrow();
    expect(() =>
      validateAgreementTermsShape(makeTerms({ budget: '1.5' })),
    ).toThrow('canonical non-negative integer string');
    expect(() =>
      validateAgreementTermsShape(makeTerms({ allocationBaseUnits: '100' })),
    ).not.toThrow();
  });

  it('rejects unrecognized runtime party roles', () => {
    const terms = makeTerms();
    terms.parties[0].role =
      'Observer' as AgreementTerms['parties'][number]['role'];
    expect(() => validateAgreementTermsShape(terms)).toThrow(
      'party role is not supported',
    );
  });

  it('allows zero fees and refunds while requiring positive milestone allocations', () => {
    expect(() =>
      validateAgreementTermsShape(
        makeTerms({ fee: '0', refund: '0', amount: '0' }),
      ),
    ).not.toThrow();
    expect(() =>
      validateAgreementTermsShape({
        ...makeTerms(),
        milestones: [{ allocationBaseUnits: '0' }],
      }),
    ).toThrow('canonical positive integer string');
  });

  it('rejects milestone allocation totals above the Award allocation', () => {
    const terms = {
      ...makeTerms(),
      milestones: [{ allocationBaseUnits: '400' }, { allocation: '101' }],
    };
    expect(() => validateMilestoneAllocationTotal(terms, '500')).toThrow(
      'cannot exceed the accepted Award allocation',
    );
    expect(() => validateMilestoneAllocationTotal(terms, '501')).not.toThrow();
  });
});

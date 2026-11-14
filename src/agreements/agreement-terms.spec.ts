import {
  canonicalAgreementTermsHash,
  canonicalEconomicTermsHash,
} from './agreement-terms.js';
import type { AgreementTerms } from './agreement.entity.js';

const terms: AgreementTerms = {
  network: 'near:testnet',
  asset: 'usdc.testnet',
  parties: [],
  milestones: [],
  verificationAuthority: {},
  deadlines: {},
  cancellationPolicy: {},
  disputePolicy: {},
  refundPolicy: {},
  legalTerms: {},
  economicTerms: { amount: '1000000', schedule: [{ due: '2027-01-01' }] },
};

describe('canonicalEconomicTermsHash', () => {
  it('is stable across object key order', () => {
    const left = { ...terms, economicTerms: { amount: '1000000', fee: '0' } };
    const right = { ...terms, economicTerms: { fee: '0', amount: '1000000' } };
    expect(canonicalEconomicTermsHash(left, 'nonce')).toBe(
      canonicalEconomicTermsHash(right, 'nonce'),
    );
  });

  it('separates versions, networks, assets and economic values', () => {
    const original = canonicalEconomicTermsHash(terms, 'nonce-a');
    expect(canonicalEconomicTermsHash(terms, 'nonce-b')).not.toBe(original);
    expect(
      canonicalEconomicTermsHash(
        { ...terms, network: 'near:mainnet' },
        'nonce-a',
      ),
    ).not.toBe(original);
    expect(
      canonicalEconomicTermsHash(
        { ...terms, economicTerms: { amount: '1000001' } },
        'nonce-a',
      ),
    ).not.toBe(original);
  });

  it('binds full party acceptance to every term and its immutable nonce', () => {
    const original = canonicalAgreementTermsHash(terms, 'nonce-a');
    expect(
      canonicalAgreementTermsHash(
        { ...terms, legalTerms: { jurisdiction: 'BO' } },
        'nonce-a',
      ),
    ).not.toBe(original);
    expect(canonicalAgreementTermsHash(terms, 'nonce-b')).not.toBe(original);
  });
});

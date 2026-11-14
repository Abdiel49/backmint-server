import { createHash } from 'node:crypto';
import type { AgreementTerms } from './agreement.entity.js';

const hashDomain = 'backmint:agreement-economic-terms:v1';

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(',')}}`;
}

export function canonicalEconomicTermsHash(
  terms: AgreementTerms,
  versionNonce: string,
): string {
  const payload = {
    domain: hashDomain,
    versionNonce,
    network: terms.network,
    asset: terms.asset,
    economicTerms: terms.economicTerms,
  };
  return createHash('sha256').update(canonicalize(payload)).digest('hex');
}

export function canonicalAgreementTermsHash(
  terms: AgreementTerms,
  versionNonce: string,
): string {
  const payload = {
    domain: 'backmint:agreement-full-terms:v1',
    versionNonce,
    terms,
  };
  return createHash('sha256').update(canonicalize(payload)).digest('hex');
}

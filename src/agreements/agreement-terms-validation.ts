import { BadRequestException } from '@nestjs/common';
import type { AgreementTerms } from './agreement.entity.js';

const validPartyRoles = new Set(['Funder', 'Recipient', 'Verifier']);
const baseUnitAmountKey =
  /(?:amount|allocation|budget|deposit|price|fee|cap|target|refund)(?:baseunits|units|atomic|usd|eur|usdc|near)?$/i;
const allocationKey = /allocation(?:baseunits|units|atomic)?$/i;

export function validateAgreementTermsShape(terms: AgreementTerms): void {
  for (const party of terms.parties) {
    if (!validPartyRoles.has(party.role))
      throw new BadRequestException('Agreement party role is not supported');
  }
  validateBaseUnitAmounts(terms);
}

export function validateMilestoneAllocationTotal(
  terms: AgreementTerms,
  awardAllocation: string,
): void {
  validateBaseUnitAmounts(terms.milestones, 'terms.milestones');
  if (!/^[1-9]\d*$/.test(awardAllocation))
    throw new BadRequestException(
      'Award allocation must be a canonical positive base-unit string',
    );
  const total = sumMilestoneAllocations(terms.milestones);
  if (total > BigInt(awardAllocation))
    throw new BadRequestException(
      'Milestone allocations cannot exceed the accepted Award allocation',
    );
}

function sumMilestoneAllocations(value: unknown): bigint {
  if (Array.isArray(value))
    return value.reduce(
      (total, item) => total + sumMilestoneAllocations(item),
      0n,
    );
  if (!value || typeof value !== 'object') return 0n;
  return Object.entries(value as Record<string, unknown>).reduce(
    (total, [key, item]) => {
      if (allocationKey.test(key)) return total + BigInt(item as string);
      return total + sumMilestoneAllocations(item);
    },
    0n,
  );
}

function validateBaseUnitAmounts(value: unknown, path = 'terms'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateBaseUnitAmounts(item, `${path}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const itemPath = `${path}.${key}`;
    if (baseUnitAmountKey.test(key)) {
      const validInteger =
        typeof item === 'string' && /^(0|[1-9]\d*)$/.test(item);
      const validAllocation =
        typeof item === 'string' && /^[1-9]\d*$/.test(item);
      if (!validInteger || (allocationKey.test(key) && !validAllocation))
        throw new BadRequestException(
          `${itemPath} must be a canonical ${allocationKey.test(key) ? 'positive' : 'non-negative'} integer string in base units`,
        );
      continue;
    }
    validateBaseUnitAmounts(item, itemPath);
  }
}

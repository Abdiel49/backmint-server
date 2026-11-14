import { ForbiddenException } from '@nestjs/common';
import type { EligibilityRuleDefinition } from './publication.types.js';

export function assertApplicantAudience(rule: EligibilityRuleDefinition, type: unknown): void {
  if (!rule.audienceTypes.includes(String(type)))
    throw new ForbiddenException('Applicant does not meet the publication audience requirements');
}

export function assertApplicantJurisdiction(rule: EligibilityRuleDefinition | undefined, country: unknown): void {
  if (!rule?.allowedJurisdictions?.length && !rule?.excludedJurisdictions?.length) return;
  if (typeof country !== 'string')
    throw new ForbiddenException('Applicant jurisdiction data is not available');
  if ((rule.allowedJurisdictions?.length && !rule.allowedJurisdictions.includes(country)) || rule.excludedJurisdictions?.includes(country))
    throw new ForbiddenException('Applicant is outside the allowed jurisdiction');
}

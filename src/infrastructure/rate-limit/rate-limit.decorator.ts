import { applyDecorators } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

export enum RateLimitPolicy {
  Default = 'default',
  Authentication = 'authentication',
  Upload = 'upload',
  Financial = 'financial',
  PublicEmbed = 'publicEmbed',
}

const strictPolicies = [
  RateLimitPolicy.Authentication,
  RateLimitPolicy.Upload,
  RateLimitPolicy.Financial,
  RateLimitPolicy.PublicEmbed,
] as const;

function skippedPolicies(activePolicy: RateLimitPolicy): Record<string, boolean> {
  return Object.fromEntries(
    [RateLimitPolicy.Default, ...strictPolicies]
      .filter((policy) => policy !== activePolicy)
      .map((policy) => [policy, true]),
  );
}

export function UseRateLimit(policy: RateLimitPolicy): MethodDecorator & ClassDecorator {
  return applyDecorators(SkipThrottle(skippedPolicies(policy)));
}

export function SkipAllRateLimits(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SkipThrottle(
      Object.fromEntries(
        [RateLimitPolicy.Default, ...strictPolicies].map((policy) => [policy, true]),
      ),
    ),
  );
}

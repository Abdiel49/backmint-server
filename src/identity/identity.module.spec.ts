import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AuthSessionGuard } from './auth-session.guard.js';
import { AuthSessionService } from './auth-session.service.js';
import { IdentityModule } from './identity.module.js';

describe('IdentityModule', () => {
  it('registers and exports the session service and guard', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, IdentityModule)).toEqual(
      expect.arrayContaining([AuthSessionService, AuthSessionGuard]),
    );
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, IdentityModule)).toEqual(
      expect.arrayContaining([AuthSessionService, AuthSessionGuard]),
    );
  });
});

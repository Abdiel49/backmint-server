import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { NearModule } from './near.module.js';
import { NearRpcService } from './near-rpc.service.js';

describe('NearModule', () => {
  it('exports the RPC service for feature modules that depend on it', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, NearModule)).toContain(
      NearRpcService,
    );
  });
});

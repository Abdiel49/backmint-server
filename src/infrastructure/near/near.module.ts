import { Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { JsonRpcProvider } from 'near-api-js';
import { nearConfig } from '../../config/configuration.js';
import { NEAR_RPC_PROVIDER } from './near.constants.js';

@Module({
  providers: [
    {
      provide: NEAR_RPC_PROVIDER,
      inject: [nearConfig.KEY],
      useFactory: (near: ConfigType<typeof nearConfig>) =>
        new JsonRpcProvider({ url: near.rpcUrl }),
    },
  ],
  exports: [NEAR_RPC_PROVIDER],
})
export class NearModule {}

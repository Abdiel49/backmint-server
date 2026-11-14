import { Module } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { JsonRpcProvider } from 'near-api-js';
import { nearConfig } from '../../config/configuration.js';
import { NEAR_RPC_CLIENT, NEAR_RPC_PROVIDER } from './near.constants.js';
import { NearRpcService } from './near-rpc.service.js';

@Module({
  providers: [
    {
      provide: NEAR_RPC_PROVIDER,
      inject: [nearConfig.KEY],
      useFactory: (near: ConfigType<typeof nearConfig>) =>
        new JsonRpcProvider(
          { url: near.rpcUrl },
          {
            retries: 1,
          },
        ),
    },
    NearRpcService,
    {
      provide: NEAR_RPC_CLIENT,
      useExisting: NearRpcService,
    },
    {
      provide: NEAR_RPC_CLIENT,
      useExisting: NearRpcService,
    },
    NearRpcService,
  ],
  exports: [NEAR_RPC_CLIENT, NEAR_RPC_PROVIDER],
})
export class NearModule {}

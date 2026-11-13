import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_PREFIX: z.string().trim().min(1).default('api'),
  SWAGGER_PATH: z.string().trim().min(1).default('docs'),
  SWAGGER_JSON_PATH: z.string().trim().min(1).default('docs/openapi.json'),
  CORS_ORIGINS: z.string().default('http://localhost:3001'),
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
  UPLOAD_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(20),
  FINANCIAL_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
  PUBLIC_EMBED_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(30),
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DATABASE_NAME: z.string().min(1),
  DATABASE_USERNAME: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional().transform((value) => value || undefined),
  OBJECT_STORAGE_ENDPOINT: z.url(),
  OBJECT_STORAGE_REGION: z.string().min(1),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
  OBJECT_STORAGE_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  NEAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  NEAR_RPC_URL: z.url(),
  NEAR_CONTRACT_ID: z.string().min(1),
  OBSERVE_APP_KEY: z.string().optional().transform((value) => value || undefined),
  OBSERVE_APP_SECRET: z.string().optional().transform((value) => value || undefined),
});

type Environment = z.infer<typeof environmentSchema>;

function getEnvironment(): Environment {
  const parsedEnvironment = environmentSchema.safeParse(process.env);

  if (!parsedEnvironment.success) {
    throw new Error(z.prettifyError(parsedEnvironment.error));
  }

  return parsedEnvironment.data;
}

export const appConfig = registerAs('app', () => {
  const environment = getEnvironment();

  return {
    port: environment.PORT,
    apiPrefix: environment.API_PREFIX,
    swaggerPath: environment.SWAGGER_PATH,
    swaggerJsonPath: environment.SWAGGER_JSON_PATH,
    corsOrigins: environment.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    rateLimitTtl: environment.RATE_LIMIT_TTL_MS,
    rateLimitMaxRequests: environment.RATE_LIMIT_MAX_REQUESTS,
    authenticationRateLimitMaxRequests: environment.AUTH_RATE_LIMIT_MAX_REQUESTS,
    uploadRateLimitMaxRequests: environment.UPLOAD_RATE_LIMIT_MAX_REQUESTS,
    financialRateLimitMaxRequests: environment.FINANCIAL_RATE_LIMIT_MAX_REQUESTS,
    publicEmbedRateLimitMaxRequests: environment.PUBLIC_EMBED_RATE_LIMIT_MAX_REQUESTS,
  };
});

export const databaseConfig = registerAs('database', () => {
  const environment = getEnvironment();

  return {
    host: environment.DATABASE_HOST,
    port: environment.DATABASE_PORT,
    username: environment.DATABASE_USERNAME,
    password: environment.DATABASE_PASSWORD,
    name: environment.DATABASE_NAME,
  };
});

export const redisConfig = registerAs('redis', () => {
  const environment = getEnvironment();

  return {
    host: environment.REDIS_HOST,
    port: environment.REDIS_PORT,
    password: environment.REDIS_PASSWORD,
  };
});

export const objectStorageConfig = registerAs('objectStorage', () => {
  const environment = getEnvironment();

  return {
    endpoint: environment.OBJECT_STORAGE_ENDPOINT,
    region: environment.OBJECT_STORAGE_REGION,
    bucket: environment.OBJECT_STORAGE_BUCKET,
    accessKey: environment.OBJECT_STORAGE_ACCESS_KEY,
    secretKey: environment.OBJECT_STORAGE_SECRET_KEY,
    forcePathStyle: environment.OBJECT_STORAGE_FORCE_PATH_STYLE,
  };
});

export const nearConfig = registerAs('near', () => {
  const environment = getEnvironment();

  return {
    network: environment.NEAR_NETWORK,
    rpcUrl: environment.NEAR_RPC_URL,
    contractId: environment.NEAR_CONTRACT_ID,
  };
});

export const observeConfig = registerAs('observe', () => {
  const environment = getEnvironment();

  return {
    appKey: environment.OBSERVE_APP_KEY,
    appSecret: environment.OBSERVE_APP_SECRET,
    serviceId: 'backmint-server',
  };
});

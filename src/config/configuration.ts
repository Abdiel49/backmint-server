import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_PREFIX: z.string().trim().min(1).default('api'),
  SWAGGER_PATH: z.string().trim().min(1).default('docs'),
  SWAGGER_JSON_PATH: z.string().trim().min(1).default('docs/openapi.json'),
  CORS_ORIGINS: z.string().default('http://localhost:3001'),
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(2_592_000).default(604_800),
  UPLOAD_RATE_LIMIT_MAX_REQUESTS: z.coerce
    .number()
    .int()
    .positive()
    .default(20),
  FINANCIAL_RATE_LIMIT_MAX_REQUESTS: z.coerce
    .number()
    .int()
    .positive()
    .default(10),
  PUBLIC_EMBED_RATE_LIMIT_MAX_REQUESTS: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DATABASE_NAME: z.string().min(1),
  DATABASE_USERNAME: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  QUEUE_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  QUEUE_BACKOFF_DELAY_MS: z.coerce.number().int().positive().default(1_000),
  QUEUE_COMPLETED_RETENTION_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(86_400),
  QUEUE_COMPLETED_RETENTION_COUNT: z.coerce
    .number()
    .int()
    .positive()
    .default(1_000),
  QUEUE_FAILED_RETENTION_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(604_800),
  QUEUE_FAILED_RETENTION_COUNT: z.coerce
    .number()
    .int()
    .positive()
    .default(1_000),
  OBJECT_STORAGE_ENDPOINT: z.url(),
  OBJECT_STORAGE_REGION: z.string().min(1),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
  OBJECT_STORAGE_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(900)
    .default(300),
  OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION: z
    .enum(['AES256', 'aws:kms'])
    .default('AES256'),
  OBJECT_STORAGE_KMS_KEY_ID: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  NEAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  NEAR_RPC_URL: z.url(),
  NEAR_CONTRACT_ID: z.string().min(1),
  OBSERVE_APP_KEY: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  OBSERVE_APP_SECRET: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  NEAR_CONTRACT_VERSION: z
    .string()
    .regex(/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
    .default('0.1.0'),
  NEAR_RPC_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  NEAR_RPC_RETRY_DELAY_MS: z.coerce
    .number()
    .int()
    .min(0)
    .max(5_000)
    .default(100),
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
    corsOrigins: environment.CORS_ORIGINS.split(',').map((origin) =>
      origin.trim(),
    ),
    trustedProxyHops: environment.TRUSTED_PROXY_HOPS,
    rateLimitTtl: environment.RATE_LIMIT_TTL_MS,
    rateLimitMaxRequests: environment.RATE_LIMIT_MAX_REQUESTS,
    authenticationRateLimitMaxRequests:
      environment.AUTH_RATE_LIMIT_MAX_REQUESTS,
    sessionTtlSeconds: environment.SESSION_TTL_SECONDS,
    uploadRateLimitMaxRequests: environment.UPLOAD_RATE_LIMIT_MAX_REQUESTS,
    financialRateLimitMaxRequests:
      environment.FINANCIAL_RATE_LIMIT_MAX_REQUESTS,
    publicEmbedRateLimitMaxRequests:
      environment.PUBLIC_EMBED_RATE_LIMIT_MAX_REQUESTS,
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

export const queuesConfig = registerAs('queues', () => {
  const environment = getEnvironment();

  return {
    attempts: environment.QUEUE_ATTEMPTS,
    backoffDelay: environment.QUEUE_BACKOFF_DELAY_MS,
    completedRetention: {
      age: environment.QUEUE_COMPLETED_RETENTION_SECONDS,
      count: environment.QUEUE_COMPLETED_RETENTION_COUNT,
    },
    failedRetention: {
      age: environment.QUEUE_FAILED_RETENTION_SECONDS,
      count: environment.QUEUE_FAILED_RETENTION_COUNT,
    },
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
    signedUrlTtlSeconds: environment.OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS,
    serverSideEncryption: environment.OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION,
    kmsKeyId: environment.OBJECT_STORAGE_KMS_KEY_ID,
  };
});

export const nearConfig = registerAs('near', () => {
  const environment = getEnvironment();

  return {
    network: environment.NEAR_NETWORK,
    rpcUrl: environment.NEAR_RPC_URL,
    contractId: environment.NEAR_CONTRACT_ID,
    contractVersion: environment.NEAR_CONTRACT_VERSION,
    maxAttempts: environment.NEAR_RPC_MAX_ATTEMPTS,
    retryDelayMs: environment.NEAR_RPC_RETRY_DELAY_MS,
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

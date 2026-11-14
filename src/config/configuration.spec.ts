import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appConfig,
  databaseConfig,
  nearConfig,
  objectStorageConfig,
  redisConfig,
} from './configuration.js';

const requiredEnvironment = {
  DATABASE_HOST: 'localhost',
  DATABASE_NAME: 'backmint_test',
  DATABASE_USERNAME: 'backmint',
  DATABASE_PASSWORD: 'test-password',
  OBJECT_STORAGE_ENDPOINT: 'https://s3.amazonaws.com',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_BUCKET: 'private-test',
  OBJECT_STORAGE_ACCESS_KEY: 'test-access-key',
  OBJECT_STORAGE_SECRET_KEY: 'test-secret-key',
  NEAR_RPC_URL: 'https://rpc.testnet.near.org',
  NEAR_CONTRACT_ID: 'backmint.testnet',
};

describe('validated environment configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('maps environment variables into typed application and dependency settings', () => {
    for (const [key, value] of Object.entries(requiredEnvironment)) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv('PORT', '3001');
    vi.stubEnv('CORS_ORIGINS', 'https://app.example, https://admin.example');
    vi.stubEnv('DATABASE_PORT', '5433');

    expect(appConfig()).toMatchObject({
      port: 3001,
      corsOrigins: ['https://app.example', 'https://admin.example'],
    });
    expect(databaseConfig()).toMatchObject({ host: 'localhost', port: 5433 });
    expect(redisConfig()).toMatchObject({ host: 'localhost', port: 6379 });
    expect(objectStorageConfig()).toMatchObject({
      endpoint: 'https://s3.amazonaws.com',
      bucket: 'private-test',
      signedUrlTtlSeconds: 300,
    });
    expect(nearConfig()).toMatchObject({
      network: 'testnet',
      contractId: 'backmint.testnet',
      contractVersion: '0.1.0',
    });
  });

  it('fails with actionable field paths when required configuration is missing', () => {
    for (const [key, value] of Object.entries(requiredEnvironment)) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv('DATABASE_HOST', '');

    expect(() => databaseConfig()).toThrow(/DATABASE_HOST/);
  });

  it('rejects invalid numeric, URL, and enum configuration', () => {
    for (const [key, value] of Object.entries(requiredEnvironment)) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv('PORT', '70000');
    vi.stubEnv('OBJECT_STORAGE_ENDPOINT', 'not-a-url');
    vi.stubEnv('NEAR_NETWORK', 'unknown');

    expect(() => appConfig()).toThrow(/PORT/);
    expect(() => objectStorageConfig()).toThrow(/OBJECT_STORAGE_ENDPOINT/);
    expect(() => nearConfig()).toThrow(/NEAR_NETWORK/);
  });
});

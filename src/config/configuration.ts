import { registerAs } from '@nestjs/config';

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function getPort(name: string, fallback?: number): number {
  const value = process.env[name];

  if (!value && fallback !== undefined) {
    return fallback;
  }

  const port = Number.parseInt(value ?? '', 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be a valid port number`);
  }

  return port;
}

export const appConfig = registerAs('app', () => ({
  port: getPort('PORT', 3000),
}));

export const databaseConfig = registerAs('database', () => ({
  host: getRequiredEnvironmentVariable('DATABASE_HOST'),
  port: getPort('DATABASE_PORT', 5432),
  username: getRequiredEnvironmentVariable('DATABASE_USERNAME'),
  password: getRequiredEnvironmentVariable('DATABASE_PASSWORD'),
  name: getRequiredEnvironmentVariable('DATABASE_NAME'),
}));

export const observeConfig = registerAs('observe', () => ({
  appKey: process.env.OBSERVE_APP_KEY,
  appSecret: process.env.OBSERVE_APP_SECRET,
  serviceId: 'backmint-server',
}));

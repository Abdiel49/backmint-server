import createClient from 'openapi-fetch';
import type { paths } from './backmint-api.js';

export type BackmintClient = ReturnType<typeof createBackmintClient>;

export function createBackmintClient(
  baseUrl: string,
  options: { bearerToken?: string; fetch?: typeof globalThis.fetch } = {},
) {
  return createClient<paths>({
    baseUrl: baseUrl.replace(/\/+$/, ''),
    fetch: options.fetch,
    headers: options.bearerToken
      ? { Authorization: `Bearer ${options.bearerToken}` }
      : undefined,
  });
}

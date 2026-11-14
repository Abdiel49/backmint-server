import { z } from 'zod';

const originSchema = z.string().url().refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.origin === value.replace(/\/$/, '') && parsed.protocol === 'https:';
  } catch {
    return false;
  }
}, 'Origins must be HTTPS origins without paths').transform((value) => new URL(value).origin);

const themeSchema = z.record(z.string(),
  z.string().max(100).refine((value) => !/[<>;{}]/.test(value), 'Theme values contain unsupported characters'),
).refine((theme) => Object.keys(theme).every((key) =>
  ['accentColor', 'surfaceColor', 'textColor', 'borderRadius', 'fontFamily'].includes(key),
), 'Theme contains an unsupported setting');

export const externalEmbedInputSchema = z.object({
  hostOrganizationId: z.string().uuid(),
  sourceType: z.enum(['Project', 'Call']),
  sourceId: z.string().uuid(),
  allowedOrigins: z.array(originSchema).min(1).max(20),
  theme: themeSchema.default({}),
  mode: z.enum(['Card', 'List', 'Link']),
  status: z.enum(['Active', 'Disabled']).default('Disabled'),
  scriptVersion: z.string().regex(/^v[1-9][0-9]*$/).default('v1'),
}).strict();

export const externalEmbedUpdateSchema = externalEmbedInputSchema.omit({
  hostOrganizationId: true,
}).partial().strict();

export type ExternalEmbedInput = z.infer<typeof externalEmbedInputSchema>;
export type ExternalEmbedUpdate = z.infer<typeof externalEmbedUpdateSchema>;

import { describe, expect, it } from 'vitest';
import { encodeNep413Payload } from './wallet-link.service.js';

describe('encodeNep413Payload', () => {
  it('encodes the NEP-413 tag and Borsh payload fields', () => {
    const payload = encodeNep413Payload('hi', new Uint8Array(32), 'app');

    expect(payload.readUInt32LE(0)).toBe(2 ** 31 + 413);
    expect(payload.readUInt32LE(4)).toBe(2);
    expect(payload.subarray(8, 10).toString()).toBe('hi');
    expect(payload.subarray(10, 42)).toEqual(Buffer.alloc(32));
    expect(payload.readUInt32LE(42)).toBe(3);
    expect(payload.subarray(46, 49).toString()).toBe('app');
    expect(payload[49]).toBe(0);
  });

  it('rejects nonce values that do not contain 32 bytes', () => {
    expect(() => encodeNep413Payload('hi', new Uint8Array(31), 'app')).toThrow(
      'NEP-413 nonce must contain exactly 32 bytes',
    );
  });
});

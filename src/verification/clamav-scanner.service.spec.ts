import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { ClamAvScannerService } from './clamav-scanner.service.js';

describe('ClamAvScannerService', () => {
  it('streams a bounded document to ClamAV and accepts only an explicit clean response', async () => {
    const server = createServer((socket) => {
      let received = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        received = Buffer.concat([received, chunk]);
        if (received.includes(Buffer.alloc(4))) socket.end('stream: OK\0');
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Scanner test server did not bind');
    const scanner = new ClamAvScannerService({
      enabled: true,
      host: '127.0.0.1',
      port: address.port,
      timeoutMs: 2_000,
      maxBytes: 1024,
    });
    try {
      await expect(
        scanner.scan([Buffer.from('test document')], 13),
      ).resolves.toBe('clean');
    } finally {
      server.close();
    }
  });

  it('fails closed when scanning is disabled or the object exceeds its configured bound', async () => {
    const disabled = new ClamAvScannerService({
      enabled: false,
      host: '127.0.0.1',
      port: 3310,
      timeoutMs: 1_000,
      maxBytes: 100,
    });
    await expect(disabled.scan([Buffer.from('x')], 1)).rejects.toThrow(
      'disabled',
    );
    const enabled = new ClamAvScannerService({
      enabled: true,
      host: '127.0.0.1',
      port: 3310,
      timeoutMs: 1_000,
      maxBytes: 1,
    });
    await expect(enabled.scan([Buffer.from('xx')], 2)).rejects.toThrow(
      'configured malware scan limit',
    );
  });
});

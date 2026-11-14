import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { Socket, createConnection } from 'node:net';
import { malwareScanConfig } from '../config/configuration.js';

export type MalwareScanResult = 'clean' | 'infected';

@Injectable()
export class ClamAvScannerService {
  constructor(
    @Inject(malwareScanConfig.KEY)
    private readonly configuration: ConfigType<typeof malwareScanConfig>,
  ) {}

  async scan(
    chunks: AsyncIterable<Uint8Array>,
    expectedLength: number,
  ): Promise<MalwareScanResult> {
    if (!this.configuration.enabled) {
      throw new Error('Malware scanner is disabled');
    }
    if (expectedLength < 1 || expectedLength > this.configuration.maxBytes) {
      throw new Error('Document exceeds the configured malware scan limit');
    }

    const socket = createConnection({
      host: this.configuration.host,
      port: this.configuration.port,
    });
    socket.setTimeout(this.configuration.timeoutMs);
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('error', reject);
        socket.once('timeout', () =>
          reject(new Error('ClamAV connection timed out')),
        );
      });
    } catch (error) {
      socket.destroy();
      throw error;
    }
    const response = this.readResponse(socket);
    void response.catch(() => undefined);

    try {
      await this.write(socket, Buffer.from('zINSTREAM\0'));
      let totalBytes = 0;
      for await (const chunk of chunks) {
        totalBytes += chunk.byteLength;
        if (
          totalBytes > this.configuration.maxBytes ||
          totalBytes > expectedLength
        ) {
          throw new Error('Scanned object exceeds its declared length');
        }
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.byteLength);
        await this.write(socket, size);
        await this.write(socket, Buffer.from(chunk));
      }
      if (totalBytes !== expectedLength) {
        throw new Error('Scanned object length does not match its declaration');
      }
      await this.write(socket, Buffer.alloc(4));
      const result = await response;
      if (result.endsWith(' OK')) return 'clean';
      if (result.includes(' FOUND')) return 'infected';
      throw new Error('ClamAV returned an unrecognized scan response');
    } finally {
      socket.destroy();
    }
  }

  private readResponse(socket: Socket): Promise<string> {
    return new Promise((resolve, reject) => {
      let response = '';
      socket.on('data', (data: Buffer) => {
        response += data.toString('utf8');
        if (response.includes('\0') || response.endsWith('\n')) {
          resolve(response.replace(/[\0\r\n]+$/, ''));
        }
      });
      socket.once('error', reject);
      socket.once('timeout', () => reject(new Error('ClamAV scan timed out')));
      socket.once('close', () => {
        if (!response) reject(new Error('ClamAV closed without a scan result'));
      });
    });
  }

  private async write(socket: Socket, data: Buffer): Promise<void> {
    if (socket.write(data)) return;
    await new Promise<void>((resolve, reject) => {
      socket.once('drain', resolve);
      socket.once('error', reject);
      socket.once('timeout', () => reject(new Error('ClamAV write timed out')));
    });
  }
}

import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthSessionGuard } from './auth-session.guard.js';
import { AuthSessionService } from './auth-session.service.js';
import { WalletLinkController } from './wallet-link.controller.js';
import { WalletLinkService } from './wallet-link.service.js';

describe('WalletLinkController', () => {
  const session = { id: 'session-1', userId: 'user-1' };

  it('rejects invalid challenge input before calling the service', async () => {
    const issueChallenge = vi.fn();
    const controller = new WalletLinkController({
      issueChallenge,
    } as unknown as WalletLinkService);

    await expect(
      controller.issueChallenge({ accountId: 'INVALID ACCOUNT' }, session),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(issueChallenge).not.toHaveBeenCalled();
  });

  it('binds challenge issuance and link verification to the authenticated user', async () => {
    const issueChallenge = vi.fn().mockResolvedValue({ id: 'challenge-1' });
    const verifyAndLink = vi.fn().mockResolvedValue({
      id: 'link-1',
      userId: 'user-1',
      accountId: 'alice.testnet',
      network: 'testnet',
      publicKey: 'ed25519:11111111111111111111111111111111',
      verifiedAt: new Date('2026-11-14T12:00:00.000Z'),
      revokedAt: null,
      createdAt: new Date('2026-11-14T12:00:00.000Z'),
    });
    const service = {
      issueChallenge,
      verifyAndLink,
    } as unknown as WalletLinkService;
    const controller = new WalletLinkController(service);

    await controller.issueChallenge({ accountId: 'alice.testnet' }, session);
    expect(issueChallenge).toHaveBeenCalledWith('user-1', 'alice.testnet');

    await controller.verifyAndLink(
      {
        challengeId: '5ac4e770-0f69-4d72-99e3-4d7f853499f4',
        nonce: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
        signature: 'A'.repeat(86) + '==',
        publicKey: 'ed25519:11111111111111111111111111111111',
      },
      session,
    );
    expect(verifyAndLink).toHaveBeenCalledWith('user-1', expect.any(Object));
  });

  it('lists and revokes links only within the current user scope', async () => {
    const listActiveLinks = vi.fn().mockResolvedValue([]);
    const revoke = vi.fn().mockResolvedValue(undefined);
    const controller = new WalletLinkController({
      listActiveLinks,
      revoke,
    } as unknown as WalletLinkService);

    await expect(controller.listLinks(session)).resolves.toEqual([]);
    await controller.revokeLink('link-1', session);
    expect(listActiveLinks).toHaveBeenCalledWith('user-1');
    expect(revoke).toHaveBeenCalledWith('user-1', 'link-1');
  });

  it('requires bearer authentication on every wallet route', async () => {
    const module = await Test.createTestingModule({
      controllers: [WalletLinkController],
      providers: [
        AuthSessionGuard,
        {
          provide: AuthSessionService,
          useValue: { authenticate: vi.fn().mockResolvedValue(null) },
        },
        {
          provide: WalletLinkService,
          useValue: {},
        },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    try {
      await request(app.getHttpServer())
        .post('/api/auth/wallet/challenges')
        .send({ accountId: 'alice.testnet' })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/wallet/links')
        .send({})
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/auth/wallet/links')
        .expect(401);
      await request(app.getHttpServer())
        .delete('/api/auth/wallet/links/1ed85f24-fbe3-4a2b-8570-85571d64b76f')
        .expect(401);
    } finally {
      await app.close();
    }
  });
});

import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AuthSessionController } from './auth-session.controller.js';
import { AuthSessionGuard } from './auth-session.guard.js';
import { AuthSessionService } from './auth-session.service.js';

describe('authentication OpenAPI contract', () => {
  it('documents each bearer-protected session endpoint and its responses', async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthSessionController],
      providers: [
        AuthSessionGuard,
        { provide: AuthSessionService, useValue: {} },
      ],
    }).compile();
    const app = module.createNestApplication();
    await app.init();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );

    expect(document.paths['/auth/session']?.get).toMatchObject({
      security: [{ bearer: [] }],
      responses: {
        '200': {
          content: {
            'application/json': {
              example: {
                sessionId: expect.any(String),
                userId: expect.any(String),
              },
            },
          },
        },
        '401': {
          content: { 'application/json': { example: { statusCode: 401 } } },
        },
      },
    });
    expect(document.paths['/auth/session']?.delete?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/auth/sessions']?.delete?.security).toEqual([
      { bearer: [] },
    ]);

    await app.close();
  });
});

import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AuthSessionGuard } from '../identity/auth-session.guard.js';
import { AuthSessionService } from '../identity/auth-session.service.js';
import { ParticipationService } from './participation.service.js';
import { ApplicationLifecycleController } from './application-lifecycle.controller.js';

describe('Application lifecycle OpenAPI contract', () => {
  it('documents bearer security, realistic examples and transition responses', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ApplicationLifecycleController],
      providers: [
        AuthSessionGuard,
        { provide: AuthSessionService, useValue: {} },
        { provide: ParticipationService, useValue: {} },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const withdraw =
      document.paths['/api/applications/{applicationId}/withdraw']?.post;
    const resubmit =
      document.paths['/api/applications/{applicationId}/resubmissions']?.post;

    expect(withdraw?.security).toEqual([{ bearer: [] }]);
    expect(withdraw?.responses).toHaveProperty('400');
    expect(withdraw?.responses).toHaveProperty('401');
    expect(resubmit?.security).toEqual([{ bearer: [] }]);
    expect(resubmit?.responses).toHaveProperty('409');
    expect(resubmit?.responses).toHaveProperty('401');
    expect(resubmit?.requestBody).toMatchObject({
      content: {
        'application/json': {
          examples: {
            solarGrantResubmission: {
              value: {
                proposal: {
                  projectPlan:
                    'Install 18 solar panels and train local technicians.',
                },
                answers: expect.any(Array),
              },
            },
          },
        },
      },
    });

    await app.close();
  });
});

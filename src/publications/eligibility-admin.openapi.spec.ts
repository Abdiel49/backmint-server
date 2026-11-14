import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AuthSessionGuard } from '../identity/auth-session.guard.js';
import { AuthSessionService } from '../identity/auth-session.service.js';
import { EligibilityAdminController } from './eligibility-admin.controller.js';
import { EligibilityAdminService } from './eligibility-admin.service.js';

describe('eligibility administration OpenAPI contract', () => {
  it('documents the bearer protected configuration endpoint and realistic request example', async () => {
    const module = await Test.createTestingModule({
      controllers: [EligibilityAdminController],
      providers: [
        { provide: EligibilityAdminService, useValue: {} },
        { provide: AuthSessionGuard, useValue: { canActivate: () => true } },
        { provide: AuthSessionService, useValue: {} },
      ],
    }).compile();
    const app = module.createNestApplication();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const operation =
      document.paths['/publications/{sourceType}/{sourceId}/eligibility']?.put;
    expect(operation?.security).toEqual([{ bearer: [] }]);
    expect(JSON.stringify(operation?.requestBody)).toContain(
      'Describe the expected community impact',
    );
    expect(operation?.responses).toHaveProperty('400');
    expect(operation?.responses).toHaveProperty('403');
    await app.close();
  });
});

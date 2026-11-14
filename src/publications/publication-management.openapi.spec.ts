import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AuthSessionGuard } from '../identity/auth-session.guard.js';
import { AuthSessionService } from '../identity/auth-session.service.js';
import { PublicationManagementController } from './publication-management.controller.js';
import { PublicationManagementService } from './publication-management.service.js';

describe('publication management OpenAPI contract', () => {
  it('documents independent bearer protected Project and Call management operations', async () => {
    const module = await Test.createTestingModule({
      controllers: [PublicationManagementController],
      providers: [
        AuthSessionGuard,
        { provide: AuthSessionService, useValue: {} },
        { provide: PublicationManagementService, useValue: {} },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const projectCreate = document.paths['/api/projects']?.post;
    const callCreate = document.paths['/api/calls']?.post;

    expect(Object.keys(document.paths)).toHaveLength(12);
    expect(projectCreate?.security).toEqual([{ bearer: [] }]);
    expect(projectCreate?.requestBody?.content?.['application/json']?.schema).toMatchObject({
      example: {
        title: 'Community Solar Pilot',
        direction: 'FundingRequested',
        objectives: ['Install a 20 kW solar system'],
      },
    });
    expect(callCreate?.requestBody?.content?.['application/json']?.schema).toMatchObject({
      example: {
        title: 'Community Solar Grants',
        direction: 'FundingOffered',
        audienceTypes: ['Community', 'Nonprofit'],
      },
    });
    expect(document.paths['/api/projects/{id}/publish']?.post?.responses).toMatchObject({
      '200': { description: 'Project published.' },
      '400': { description: expect.any(String) },
      '401': { description: expect.any(String) },
      '403': { description: expect.any(String) },
      '404': { description: expect.any(String) },
    });
    expect(document.paths['/api/projects/{id}/visibility']?.patch?.security).toEqual([
      { bearer: [] },
    ]);

    await app.close();
  });
});

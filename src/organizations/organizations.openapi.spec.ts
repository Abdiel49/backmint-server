import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AuthSessionGuard } from '../identity/auth-session.guard.js';
import { AuthSessionService } from '../identity/auth-session.service.js';
import { OrganizationMembershipService } from './organization-membership.service.js';
import { OrganizationService } from './organization.service.js';
import { OrganizationsController } from './organizations.controller.js';

describe('organizations OpenAPI contract', () => {
  it('documents bearer access, realistic request examples, and response examples', async () => {
    const module = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        AuthSessionGuard,
        { provide: AuthSessionService, useValue: {} },
        { provide: OrganizationService, useValue: {} },
        { provide: OrganizationMembershipService, useValue: {} },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const paths = document.paths;
    const protectedOperations = [
      paths['/api/organizations']?.post,
      paths['/api/organizations']?.get,
      paths['/api/organizations/{organizationId}/memberships']?.post,
      paths['/api/organizations/memberships/{membershipId}/accept']?.post,
      paths['/api/organizations/memberships/{membershipId}/role']?.patch,
      paths['/api/organizations/memberships/{membershipId}']?.delete,
    ];

    expect(protectedOperations).toHaveLength(6);
    for (const operation of protectedOperations) {
      expect(operation?.security).toEqual([{ bearer: [] }]);
      expect(operation?.responses).toHaveProperty('401');
    }
    expect(paths['/api/organizations']?.post?.requestBody).toMatchObject({
      content: {
        'application/json': {
          examples: {
            nonprofit: {
              value: {
                slug: 'green-futures-bolivia',
                organizationType: 'Nonprofit',
              },
            },
          },
        },
      },
    });
    expect(paths['/api/organizations']?.post?.responses).toHaveProperty('201');
    expect(
      paths['/api/organizations/{organizationId}/memberships']?.post
        ?.requestBody,
    ).toMatchObject({
      content: {
        'application/json': {
          examples: {
            evaluator: {
              value: {
                userId: 'd899b174-ff35-4c79-9b42-262f694281d5',
                role: 'Evaluator',
              },
            },
          },
        },
      },
    });

    await app.close();
  });
});

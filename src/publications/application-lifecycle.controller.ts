import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StandardSchemaValidationPipe,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  AuthSessionGuard,
  CurrentSession,
} from '../identity/auth-session.guard.js';
import type { AuthenticatedSession } from '../identity/auth-session.service.js';
import { ParticipationService } from './participation.service.js';

const resubmissionSchema = z.object({
  proposal: z.record(z.string(), z.unknown()),
  answers: z.array(
    z.object({
      questionKey: z.string().min(1).max(80),
      answer: z.unknown().refine((value) => value !== undefined),
      attachmentIds: z.array(z.string().uuid()).optional(),
    }),
  ),
  referencedProjectId: z.string().uuid().optional(),
});

@ApiTags('Applications')
@ApiBearerAuth()
@ApiResponse({
  status: 401,
  description: 'A valid bearer session is required.',
  schema: {
    example: {
      statusCode: 401,
      message: 'A valid bearer session is required',
      error: 'Unauthorized',
    },
  },
})
@UseGuards(AuthSessionGuard)
@Controller('applications')
export class ApplicationLifecycleController {
  constructor(private readonly participation: ParticipationService) {}

  @Post(':applicationId/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraw an eligible Application' })
  @ApiResponse({
    status: 200,
    description:
      'The Application is withdrawn and its submitted record remains immutable.',
    schema: {
      example: {
        id: 'aee1673e-11ce-4d3f-916c-a1902ee72f08',
        status: 'Withdrawn',
        receipt: '70dc1710-07ea-42d2-a004-c79b776e0b63',
        withdrawnAt: '2026-11-14T17:25:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The current Application state cannot be withdrawn.',
    schema: {
      example: {
        statusCode: 400,
        message: 'Application can no longer be withdrawn',
        error: 'Bad Request',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'The Application is unavailable to this authenticated user.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Application not found',
        error: 'Not Found',
      },
    },
  })
  async withdraw(
    @Param('applicationId') applicationId: string,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    this.assertUuid(applicationId);
    const application = await this.participation.withdrawApplication(
      applicationId,
      session.userId,
    );
    return {
      id: application.id,
      status: application.status,
      receipt: application.receipt,
      withdrawnAt: application.withdrawnAt,
    };
  }

  @Post(':applicationId/resubmissions')
  @UsePipes(new StandardSchemaValidationPipe())
  @ApiOperation({
    summary: 'Create a policy-authorized immutable Application resubmission',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['proposal', 'answers'],
      properties: {
        proposal: {
          type: 'object',
          example: { projectPlan: 'Install 18 solar panels.' },
        },
        answers: {
          type: 'array',
          example: [
            { questionKey: 'community', answer: 'Three rural schools' },
          ],
          items: {
            type: 'object',
            required: ['questionKey', 'answer'],
            properties: {
              questionKey: { type: 'string', example: 'community' },
              answer: { example: 'Three rural schools' },
              attachmentIds: {
                type: 'array',
                items: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
        referencedProjectId: { type: 'string', format: 'uuid' },
      },
    },
    examples: {
      solarGrantResubmission: {
        summary: 'Update a solar grant application after withdrawal',
        value: {
          proposal: {
            projectPlan: 'Install 18 solar panels and train local technicians.',
          },
          answers: [
            {
              questionKey: 'community',
              answer: 'Three rural schools serving 420 students',
            },
            {
              questionKey: 'maintenance',
              answer: 'Train two technicians at each school',
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description:
      'A new Application version with a new receipt, linked to its withdrawn predecessor.',
    schema: {
      example: {
        id: '2dc1cd2c-10d2-450d-a2bc-a6dfaf509fa3',
        supersedesApplicationId: 'aee1673e-11ce-4d3f-916c-a1902ee72f08',
        status: 'Submitted',
        receipt: 'b2b54f52-57f8-4c6f-8625-7ed1558811c4',
        sourceVersion: 4,
        submittedAt: '2026-11-14T17:30:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'The predecessor state, current source policy, eligibility or questionnaire does not allow resubmission.',
    schema: {
      example: {
        statusCode: 400,
        message: 'This source does not allow resubmission',
        error: 'Bad Request',
      },
    },
  })
  @ApiConflictResponse({
    description: 'A resubmission already exists for this predecessor.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Application already has a resubmission',
        error: 'Conflict',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'The Application is unavailable to this authenticated user.',
    schema: {
      example: {
        statusCode: 404,
        message: 'Application not found',
        error: 'Not Found',
      },
    },
  })
  async resubmit(
    @Param('applicationId') applicationId: string,
    @Body({ schema: resubmissionSchema })
    body: z.infer<typeof resubmissionSchema>,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    this.assertUuid(applicationId);
    const application = await this.participation.resubmitApplication(
      applicationId,
      session.userId,
      body,
    );
    return {
      id: application.id,
      supersedesApplicationId: application.supersedesApplicationId,
      status: application.status,
      receipt: application.receipt,
      sourceVersion: application.sourceVersion,
      submittedAt: application.submittedAt,
    };
  }

  private assertUuid(value: string): void {
    if (!z.string().uuid().safeParse(value).success) {
      throw new BadRequestException('applicationId must be a UUID');
    }
  }
}

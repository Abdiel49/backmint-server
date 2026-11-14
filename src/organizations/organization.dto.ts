import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import {
  LegalStatus,
  OrganizationType,
  OrganizationVisibility,
} from './organization.entity.js';
import { OrganizationRole } from '../domain/authorization/authorization.js';

const organizationTypes = Object.values(OrganizationType) as [
  OrganizationType,
  ...OrganizationType[],
];
const legalStatuses = Object.values(LegalStatus) as [
  LegalStatus,
  ...LegalStatus[],
];
const visibilities = Object.values(OrganizationVisibility) as [
  OrganizationVisibility,
  ...OrganizationVisibility[],
];
const assignableRoles = Object.values(OrganizationRole).filter(
  (role) => role !== OrganizationRole.Owner,
) as Exclude<OrganizationRole, 'Owner'>[];

export const createOrganizationSchema = z.strictObject({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/),
  name: z.string().trim().min(1).max(160),
  organizationType: z.enum(organizationTypes),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/),
  legalStatus: z.enum(legalStatuses),
  visibility: z.enum(visibilities).optional(),
});

export const inviteOrganizationMemberSchema = z.strictObject({
  userId: z.uuid(),
  role: z.enum(
    assignableRoles as [
      Exclude<OrganizationRole, 'Owner'>,
      ...Exclude<OrganizationRole, 'Owner'>[],
    ],
  ),
});

export const changeOrganizationMemberRoleSchema = z.strictObject({
  role: z.enum(
    assignableRoles as [
      Exclude<OrganizationRole, 'Owner'>,
      ...Exclude<OrganizationRole, 'Owner'>[],
    ],
  ),
});

export class CreateOrganizationDto {
  @ApiProperty({ example: 'green-futures-bolivia' })
  slug!: string;

  @ApiProperty({ example: 'Green Futures Bolivia' })
  name!: string;

  @ApiProperty({ enum: organizationTypes, example: OrganizationType.Nonprofit })
  organizationType!: OrganizationType;

  @ApiProperty({ example: 'BO', minLength: 2, maxLength: 2 })
  country!: string;

  @ApiProperty({ enum: legalStatuses, example: LegalStatus.Incorporated })
  legalStatus!: LegalStatus;

  @ApiPropertyOptional({
    enum: visibilities,
    example: OrganizationVisibility.Private,
  })
  visibility?: OrganizationVisibility;
}

export class InviteOrganizationMemberDto {
  @ApiProperty({
    format: 'uuid',
    example: 'd899b174-ff35-4c79-9b42-262f694281d5',
  })
  userId!: string;

  @ApiProperty({ enum: assignableRoles, example: OrganizationRole.Evaluator })
  role!: Exclude<OrganizationRole, 'Owner'>;
}

export class ChangeOrganizationMemberRoleDto {
  @ApiProperty({
    enum: assignableRoles,
    example: OrganizationRole.ProjectManager,
  })
  role!: Exclude<OrganizationRole, 'Owner'>;
}

export class OrganizationResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
  })
  id!: string;

  @ApiProperty({ example: 'green-futures-bolivia' })
  slug!: string;

  @ApiProperty({ example: 'Green Futures Bolivia' })
  name!: string;

  @ApiProperty({ enum: organizationTypes, example: OrganizationType.Nonprofit })
  organizationType!: OrganizationType;

  @ApiProperty({ example: 'BO' })
  country!: string;

  @ApiProperty({ enum: legalStatuses, example: LegalStatus.Incorporated })
  legalStatus!: LegalStatus;

  @ApiProperty({ enum: visibilities, example: OrganizationVisibility.Private })
  visibility!: OrganizationVisibility;

  @ApiProperty({ example: 'Active' })
  status!: string;

  @ApiProperty({
    format: 'uuid',
    example: 'cba05615-9665-4d4c-a38e-05d69fa17536',
  })
  ownerUserId!: string;

  @ApiProperty({ example: '2026-11-14T12:00:00.000Z' })
  createdAt!: Date;
}

export class OrganizationMembershipResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: 'f92f7e44-bef9-46a3-8e25-f346161ce716',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    example: 'a54e27b4-2c0a-4d66-a9ab-8c98fb6281e8',
  })
  organizationId!: string;

  @ApiProperty({
    format: 'uuid',
    example: 'd899b174-ff35-4c79-9b42-262f694281d5',
  })
  userId!: string;

  @ApiProperty({ enum: assignableRoles, example: OrganizationRole.Evaluator })
  role!: OrganizationRole;

  @ApiProperty({
    enum: ['Invited', 'Active', 'Suspended', 'Revoked'],
    example: 'Invited',
  })
  status!: string;

  @ApiProperty({
    format: 'uuid',
    example: 'cba05615-9665-4d4c-a38e-05d69fa17536',
  })
  invitedByUserId!: string;

  @ApiPropertyOptional({ example: null })
  acceptedAt!: Date | null;

  @ApiPropertyOptional({ example: null })
  revokedAt!: Date | null;
}

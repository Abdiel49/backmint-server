import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

export const OrganizationType = {
  Company: 'Company',
  Community: 'Community',
  Foundation: 'Foundation',
  Nonprofit: 'Nonprofit',
  EducationalInstitution: 'EducationalInstitution',
  Government: 'Government',
  Other: 'Other',
} as const;

export type OrganizationType =
  (typeof OrganizationType)[keyof typeof OrganizationType];

export const LegalStatus = {
  Incorporated: 'Incorporated',
  Informal: 'Informal',
} as const;

export type LegalStatus = (typeof LegalStatus)[keyof typeof LegalStatus];

export const OrganizationVisibility = {
  Private: 'Private',
  Unlisted: 'Unlisted',
  Public: 'Public',
} as const;

export type OrganizationVisibility =
  (typeof OrganizationVisibility)[keyof typeof OrganizationVisibility];

export const OrganizationStatus = {
  Active: 'Active',
  Suspended: 'Suspended',
  Archived: 'Archived',
} as const;

export type OrganizationStatus =
  (typeof OrganizationStatus)[keyof typeof OrganizationStatus];

@Entity('organizations')
@Index('UQ_organizations_slug', ['slug'], { unique: true })
export class OrganizationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  slug!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 32 })
  organizationType!: OrganizationType;

  @Column({ type: 'char', length: 2 })
  country!: string;

  @Column({ type: 'varchar', length: 24 })
  legalStatus!: LegalStatus;

  @Column({ type: 'varchar', length: 16, default: 'Private' })
  visibility!: OrganizationVisibility;

  @Column({ type: 'varchar', length: 16, default: 'Active' })
  status!: OrganizationStatus;

  @Column({ type: 'boolean', default: false })
  discloseVerificationStatus!: boolean;

  @Column({ type: 'uuid' })
  ownerUserId!: string;

  @VersionColumn({ type: 'integer' })
  stateVersion!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

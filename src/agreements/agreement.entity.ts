import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const AgreementStatus = {
  Draft: 'Draft',
  PendingAcceptance: 'PendingAcceptance',
  Accepted: 'Accepted',
  AwaitingFunding: 'AwaitingFunding',
  PartiallyFunded: 'PartiallyFunded',
  Funded: 'Funded',
  Active: 'Active',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  Disputed: 'Disputed',
  Expired: 'Expired',
} as const;

export type AgreementStatus =
  (typeof AgreementStatus)[keyof typeof AgreementStatus];

export type AgreementPartyRole = 'Funder' | 'Recipient' | 'Verifier';

export type AgreementParty = {
  key: string;
  role: AgreementPartyRole;
  organizationId?: string;
  userId?: string;
  required: boolean;
};

export type AgreementTerms = {
  network: string;
  asset: string;
  parties: AgreementParty[];
  milestones: Array<Record<string, unknown>>;
  verificationAuthority: Record<string, unknown>;
  deadlines: Record<string, string>;
  cancellationPolicy: Record<string, unknown>;
  disputePolicy: Record<string, unknown>;
  refundPolicy: Record<string, unknown>;
  legalTerms: Record<string, unknown>;
  economicTerms: Record<string, unknown>;
};

@Entity('agreements')
@Index('UQ_agreements_award', ['awardId'], { unique: true })
export class AgreementEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  awardId!: string;

  @Column({ type: 'varchar', length: 24, default: AgreementStatus.Draft })
  status!: AgreementStatus;

  @Column({ type: 'integer', default: 1 })
  currentVersion!: number;

  @Column({ type: 'uuid' })
  createdByUserId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity('agreement_versions')
@Index('UQ_agreement_versions_number', ['agreementId', 'version'], {
  unique: true,
})
export class AgreementVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  agreementId!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'jsonb' })
  terms!: AgreementTerms;

  @Column({ type: 'varchar', length: 64 })
  economicTermsHash!: string;

  @Column({ type: 'varchar', length: 64 })
  termsHash!: string;

  @Column({ type: 'uuid' })
  versionNonce!: string;

  @Column({ type: 'timestamptz' })
  acceptanceExpiresAt!: Date;

  @Column({ type: 'varchar', length: 255 })
  contractArtifactReference!: string;

  @Column({ type: 'uuid' })
  createdByUserId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

@Entity('agreement_party_acceptances')
@Index(
  'UQ_agreement_acceptance_party_version',
  ['agreementId', 'version', 'partyKey'],
  { unique: true },
)
export class AgreementPartyAcceptanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  agreementId!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'varchar', length: 80 })
  partyKey!: string;

  @Column({ type: 'varchar', length: 24 })
  partyRole!: AgreementPartyRole;

  @Column({ type: 'uuid' })
  acceptedByUserId!: string;

  @Column({ type: 'varchar', length: 64 })
  acceptedTermsHash!: string;

  @Column({ type: 'timestamptz' })
  acceptedAt!: Date;
}

@Entity('agreement_finance_confirmations')
@Index('UQ_agreement_finance_chain_operation', ['chainOperationId'], {
  unique: true,
})
@Index('IDX_agreement_finance_confirmation_agreement', ['agreementId', 'id'])
export class AgreementFinanceConfirmationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  agreementId!: string;

  @Column({ type: 'uuid' })
  chainOperationId!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: 'PartiallyFunded' | 'Funded';

  @Column({ type: 'varchar', length: 128 })
  network!: string;

  @Column({ type: 'varchar', length: 128 })
  transactionHash!: string;

  @Column({ type: 'varchar', length: 64 })
  economicTermsHash!: string;

  @Column({ type: 'timestamptz' })
  confirmedAt!: Date;
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { KeyType, PublicKey } from 'near-api-js';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { walletConfig } from '../config/configuration.js';
import { ChainOperationEntity } from '../finance/chain-operation.entity.js';
import { UserEntity } from '../identity/user.entity.js';
import { OrganizationEntity } from '../organizations/organization.entity.js';
import { OrganizationMembershipEntity } from '../organizations/organization-membership.entity.js';
import { OrganizationRepresentativeEntity } from '../organizations/organization-representative.entity.js';
import { AwardEntity } from '../publications/award.entity.js';
import {
  ApplicationEntity,
  FundingOfferEntity,
} from '../publications/application.entity.js';
import { CallEntity } from '../publications/call.entity.js';
import { ProjectEntity } from '../publications/project.entity.js';
import { WalletLinkEntity } from '../identity/wallet-link.entity.js';
import { MilestoneEntity, MilestoneTermsVersionEntity } from '../milestones/milestone.entity.js';
import { encodeNep413Payload } from '../identity/wallet-link.service.js';
import { AgreementAcceptanceChallengeEntity } from './agreement-acceptance-challenge.entity.js';
import {
  AgreementEntity,
  AgreementFinanceConfirmationEntity,
  AgreementParty,
  AgreementPartyAcceptanceEntity,
  AgreementStatus,
  AgreementTerms,
  AgreementVersionEntity,
} from './agreement.entity.js';
import {
  canonicalAgreementTermsHash,
  canonicalEconomicTermsHash,
} from './agreement-terms.js';
import { assertAgreementTransition } from './agreement-state.js';
import {
  validateAgreementTermsShape,
  validateMilestoneAllocationTotal,
} from './agreement-terms-validation.js';

export type AgreementVersionInput = {
  terms: AgreementTerms;
  acceptanceExpiresAt: Date;
  contractArtifactReference: string;
};

@Injectable()
export class AgreementsService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(walletConfig.KEY)
    private readonly wallet: ConfigType<typeof walletConfig>,
  ) {}

  async createFromAward(
    awardId: string,
    actorUserId: string,
    input: AgreementVersionInput,
  ): Promise<AgreementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const award = await manager.findOne(AwardEntity, {
        where: { id: awardId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!award) throw new NotFoundException('Award was not found');
      if (award.state !== 'Accepted')
        throw new ConflictException(
          'Award must be accepted before agreement creation',
        );
      this.validateVersionInput(input);
      validateMilestoneAllocationTotal(input.terms, award.allocation);
      await this.assertPartiesMatchAward(manager, award, input.terms.parties);
      await this.assertPartyAuthorityForAny(
        manager,
        input.terms.parties.filter(
          (party) => party.required && ['Funder', 'Recipient'].includes(party.role),
        ),
        actorUserId,
        new Date(),
      );
      const agreement = await manager.getRepository(AgreementEntity).save(
        manager.getRepository(AgreementEntity).create({
          awardId,
          status: AgreementStatus.Draft,
          currentVersion: 1,
          createdByUserId: actorUserId,
        }),
      );
      await this.persistVersion(manager, agreement, actorUserId, input, 1);
      return agreement;
    });
  }

  async createVersion(
    agreementId: string,
    actorUserId: string,
    input: AgreementVersionInput,
  ): Promise<AgreementVersionEntity> {
    return this.dataSource.transaction(async (manager) => {
      const agreement = await this.lockAgreement(manager, agreementId);
      if (
        agreement.status !== AgreementStatus.Draft &&
        agreement.status !== AgreementStatus.PendingAcceptance
      )
        throw new ConflictException('Agreement terms can no longer be amended');
      this.validateVersionInput(input);
      const award = await manager.findOneByOrFail(AwardEntity, {
        id: agreement.awardId,
      });
      validateMilestoneAllocationTotal(input.terms, award.allocation);
      await this.assertPartiesMatchAward(manager, award, input.terms.parties);
      await this.assertPartyAuthorityForAny(
        manager,
        input.terms.parties.filter(
          (party) => party.required && ['Funder', 'Recipient'].includes(party.role),
        ),
        actorUserId,
        new Date(),
      );
      const nextVersion = agreement.currentVersion + 1;
      const version = await this.persistVersion(
        manager,
        agreement,
        actorUserId,
        input,
        nextVersion,
      );
      agreement.currentVersion = nextVersion;
      agreement.status = AgreementStatus.Draft;
      await manager.save(agreement);
      return version;
    });
  }

  async submitForAcceptance(
    agreementId: string,
    actorUserId: string,
  ): Promise<AgreementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const agreement = await this.lockAgreement(manager, agreementId);
      this.assertTransition(
        agreement.status,
        AgreementStatus.PendingAcceptance,
      );
      const version = await this.currentVersion(manager, agreement);
      await this.assertPartyAuthorityForAny(
        manager,
        version.terms.parties.filter(
          (party) => party.required && ['Funder', 'Recipient'].includes(party.role),
        ),
        actorUserId,
        new Date(),
      );
      await this.assertMilestoneReviewers(manager, version.terms);
      const award = await manager.findOneByOrFail(AwardEntity, { id: agreement.awardId });
      if (BigInt(version.terms.economicTerms.allocationBaseUnits as string) > BigInt(award.allocation))
        throw new BadRequestException('Agreement allocation cannot exceed the accepted Award allocation');
      if (version.acceptanceExpiresAt.getTime() <= Date.now())
        throw new ConflictException('Agreement acceptance deadline has passed');
      agreement.status = AgreementStatus.PendingAcceptance;
      return manager.save(agreement);
    });
  }

  async issueAcceptanceChallenge(
    agreementId: string,
    actorUserId: string,
    expectedVersion: number,
    expectedHash: string,
    partyKey: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const agreement = await this.lockAgreement(manager, agreementId);
      if (agreement.status !== AgreementStatus.PendingAcceptance)
        throw new ConflictException('Agreement is not accepting signatures');
      const version = await this.currentVersion(manager, agreement);
      if (
        expectedVersion !== agreement.currentVersion ||
        expectedHash !== version.termsHash
      )
        throw new ConflictException(
          'Acceptance references a stale agreement version or terms hash',
        );
      if (version.acceptanceExpiresAt.getTime() <= Date.now())
        throw new ConflictException('Agreement acceptance deadline has passed');
      const party = version.terms.parties.find((item) => item.key === partyKey);
      if (!party)
        throw new ForbiddenException('User is not an agreement party');
      await this.assertPartyAuthority(manager, party, actorUserId, new Date());
      const walletLink = await manager.findOne(WalletLinkEntity, {
        where: {
          userId: actorUserId,
          network: this.wallet.network,
          revokedAt: IsNull(),
        },
        order: { createdAt: 'DESC' },
      });
      if (!walletLink)
        throw new ForbiddenException('An active linked NEAR wallet is required');
      if (
        version.terms.network !== this.wallet.network &&
        version.terms.network !== `near:${this.wallet.network}`
      )
        throw new ConflictException(
          'The linked wallet network does not match the agreement network',
        );

      const id = randomUUID();
      const nonce = randomBytes(32);
      const expiresAt = new Date(
        Date.now() + this.wallet.challengeTtlSeconds * 1000,
      );
      const message = JSON.stringify({
        type: 'backmint.agreement.acceptance',
        challengeId: id,
        agreementId,
        version: expectedVersion,
        termsHash: expectedHash,
        partyKey,
        userId: actorUserId,
        walletLinkId: walletLink.id,
        accountId: walletLink.accountId,
        publicKey: walletLink.publicKey,
        network: this.wallet.network,
        agreementNetwork: version.terms.network,
        recipient: this.wallet.challengeRecipient,
        expiresAt: expiresAt.toISOString(),
      });
      await manager.getRepository(AgreementAcceptanceChallengeEntity).save({
        id,
        agreementId,
        version: expectedVersion,
        termsHash: expectedHash,
        partyKey,
        userId: actorUserId,
        walletLinkId: walletLink.id,
        accountId: walletLink.accountId,
        publicKey: walletLink.publicKey,
        network: this.wallet.network,
        recipient: this.wallet.challengeRecipient,
        nonceHash: createHash('sha256').update(nonce).digest('hex'),
        message,
        expiresAt,
        usedAt: null,
      });
      return {
        id,
        message,
        nonce: nonce.toString('base64'),
        accountId: walletLink.accountId,
        publicKey: walletLink.publicKey,
        network: this.wallet.network,
        recipient: this.wallet.challengeRecipient,
        expiresAt,
      };
    });
  }

  async accept(
    agreementId: string,
    actorUserId: string,
    expectedVersion: number,
    expectedHash: string,
    partyKey: string,
    challengeId: string,
    nonceBase64: string,
    signatureBase64: string,
    now = new Date(),
  ): Promise<AgreementEntity> {
    const challenge = await this.dataSource
      .getRepository(AgreementAcceptanceChallengeEntity)
      .findOneBy({ id: challengeId, agreementId, userId: actorUserId });
    if (!challenge || challenge.usedAt || challenge.expiresAt <= now)
      throw new UnauthorizedException(
        'Agreement acceptance challenge is invalid or expired',
      );
    const nonce = Buffer.from(nonceBase64, 'base64');
    if (
      nonce.length !== 32 ||
      nonce.toString('base64') !== nonceBase64 ||
      createHash('sha256').update(nonce).digest('hex') !== challenge.nonceHash
    )
      throw new UnauthorizedException('Agreement acceptance nonce is invalid');
    if (
      challenge.version !== expectedVersion ||
      challenge.termsHash !== expectedHash ||
      challenge.partyKey !== partyKey ||
      challenge.network !== this.wallet.network ||
      challenge.recipient !== this.wallet.challengeRecipient
    )
      throw new UnauthorizedException(
        'Agreement acceptance challenge does not match the request',
      );
    let publicKey: PublicKey;
    const signature = Buffer.from(signatureBase64, 'base64');
    try {
      publicKey = PublicKey.fromString(challenge.publicKey);
      if (
        publicKey.keyType !== KeyType.ED25519 ||
        signature.length !== 64 ||
        signature.toString('base64') !== signatureBase64
      )
        throw new Error('Invalid NEP-413 signature encoding');
    } catch {
      throw new UnauthorizedException('Agreement acceptance signature is invalid');
    }
    const digest = createHash('sha256')
      .update(
        encodeNep413Payload(
          challenge.message,
          nonce,
          challenge.recipient,
        ),
      )
      .digest();
    if (!publicKey.verify(digest, signature))
      throw new UnauthorizedException('Agreement acceptance signature is invalid');

    return this.dataSource.transaction(async (manager) => {
      const agreement = await this.lockAgreement(manager, agreementId);
      if (agreement.status !== AgreementStatus.PendingAcceptance)
        throw new ConflictException('Agreement is not accepting signatures');
      const version = await this.currentVersion(manager, agreement);
      if (expectedVersion !== agreement.currentVersion)
        throw new ConflictException(
          'Acceptance references a stale agreement version',
        );
      if (expectedHash !== version.termsHash)
        throw new ConflictException(
          'Acceptance terms hash does not match the current version',
        );
      if (version.acceptanceExpiresAt.getTime() <= now.getTime())
        throw new ConflictException('Agreement acceptance deadline has passed');
      const party = version.terms.parties.find((item) => item.key === partyKey);
      if (!party)
        throw new ForbiddenException('User is not an agreement party');
      const acceptanceRepository = manager.getRepository(
        AgreementPartyAcceptanceEntity,
      );
      const activeWallet = await manager.findOne(WalletLinkEntity, {
        where: {
          id: challenge.walletLinkId,
          userId: actorUserId,
          accountId: challenge.accountId,
          publicKey: challenge.publicKey,
          network: challenge.network,
          revokedAt: IsNull(),
        },
      });
      if (!activeWallet)
        throw new UnauthorizedException(
          'The wallet linked to this challenge is no longer active',
        );
      const claimedChallenge = await manager
        .createQueryBuilder()
        .update(AgreementAcceptanceChallengeEntity)
        .set({ usedAt: now })
        .where(
          'id = :id AND "agreementId" = :agreementId AND "userId" = :userId AND "usedAt" IS NULL AND "expiresAt" > :now',
          { id: challenge.id, agreementId, userId: actorUserId, now },
        )
        .returning('id')
        .execute();
      if (claimedChallenge.affected !== 1)
        throw new UnauthorizedException(
          'Agreement acceptance challenge is invalid or expired',
        );
      const existingAcceptance = await acceptanceRepository.findOne({
        where: { agreementId, version: expectedVersion, partyKey },
      });
      if (existingAcceptance) {
        if (
          existingAcceptance.acceptedByUserId === actorUserId &&
          existingAcceptance.acceptedTermsHash === expectedHash
        )
          return agreement;
        throw new ConflictException(
          'This party has already accepted this agreement version',
        );
      }
      await this.assertPartyAuthority(manager, party, actorUserId, now);
      await acceptanceRepository.save(
        acceptanceRepository.create({
          agreementId,
          version: expectedVersion,
          partyKey,
          partyRole: party.role,
          acceptedByUserId: actorUserId,
          acceptedTermsHash: expectedHash,
          acceptedAt: now,
          acceptanceChallengeId: challenge.id,
          walletLinkId: activeWallet.id,
          signingAccountId: challenge.accountId,
          signingPublicKey: challenge.publicKey,
          signingNetwork: challenge.network,
          signingRecipient: challenge.recipient,
          signedMessage: challenge.message,
          signingNonce: nonceBase64,
          walletSignature: signatureBase64,
        }),
      );
      const requiredParties = version.terms.parties.filter(
        (item) => item.required,
      );
      const acceptances = await manager.find(AgreementPartyAcceptanceEntity, {
        where: { agreementId, version: expectedVersion },
      });
      const acceptedKeys = new Set(acceptances.map((item) => item.partyKey));
      if (requiredParties.every((item) => acceptedKeys.has(item.key))) {
        await this.materializeMilestones(manager, agreement, version, actorUserId);
        agreement.status = AgreementStatus.Accepted;
      }
      return manager.save(agreement);
    });
  }

  private parseMilestones(terms: AgreementTerms) {
    if (terms.milestones.length === 0) throw new BadRequestException('Agreement requires at least one milestone');
    const agreementAmount = terms.economicTerms.allocationBaseUnits;
    if (typeof agreementAmount !== 'string' || !/^[1-9]\d*$/.test(agreementAmount))
      throw new BadRequestException('Agreement allocationBaseUnits must be a positive integer string');
    const milestones = terms.milestones.map((item, index) => {
      const { sequence, allocationBaseUnits, acceptanceCriteria, dueAt, reviewerUserId } = item;
      if (sequence !== index + 1 || typeof allocationBaseUnits !== 'string' || !/^[1-9]\d*$/.test(allocationBaseUnits) || !acceptanceCriteria || typeof acceptanceCriteria !== 'object' || Array.isArray(acceptanceCriteria) || Object.keys(acceptanceCriteria).length === 0 || typeof reviewerUserId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reviewerUserId) || (dueAt !== undefined && (typeof dueAt !== 'string' || !Number.isFinite(Date.parse(dueAt))))) {
        throw new BadRequestException('Each milestone requires a consecutive sequence, positive allocationBaseUnits, acceptanceCriteria and reviewerUserId');
      }
      return { sequence, amount: allocationBaseUnits, acceptanceCriteria: acceptanceCriteria as Record<string, unknown>, reviewerUserId, dueAt: dueAt ? new Date(dueAt as string) : null };
    });
    if (milestones.reduce((total, item) => total + BigInt(item.amount), 0n) > BigInt(agreementAmount))
      throw new BadRequestException('Milestone allocations cannot exceed the Agreement allocation');
    return milestones;
  }

  private async materializeMilestones(manager: EntityManager, agreement: AgreementEntity, version: AgreementVersionEntity, actorUserId: string) {
    const terms = this.parseMilestones(version.terms);
    await this.assertMilestoneReviewers(manager, version.terms);
    const award = await manager.findOneByOrFail(AwardEntity, { id: agreement.awardId });
    if (BigInt(version.terms.economicTerms.allocationBaseUnits as string) > BigInt(award.allocation))
      throw new BadRequestException('Agreement allocation cannot exceed the accepted Award allocation');
    validateMilestoneAllocationTotal(version.terms, award.allocation);
    if (await manager.count(MilestoneEntity, { where: { awardId: agreement.awardId } }))
      throw new ConflictException('Award already has operational milestones');
    for (const item of terms) {
      const milestone = await manager.save(MilestoneEntity, { awardId: agreement.awardId, sequence: item.sequence, reviewerUserId: item.reviewerUserId });
      await manager.save(MilestoneTermsVersionEntity, { milestoneId: milestone.id, version: 1, amount: item.amount, acceptanceCriteria: item.acceptanceCriteria, reviewerUserId: item.reviewerUserId, dueAt: item.dueAt, createdByUserId: actorUserId });
    }
  }

  private async assertMilestoneReviewers(manager: EntityManager, terms: AgreementTerms) {
    for (const item of this.parseMilestones(terms)) {
      if (!await manager.findOne(UserEntity, { where: { id: item.reviewerUserId, status: 'Active' } }))
        throw new BadRequestException('Milestone reviewer must be an active user');
    }
  }

  async confirmFundingFromChain(
    agreementId: string,
    chainOperationId: string,
    confirmedStatus: 'PartiallyFunded' | 'Funded',
    now = new Date(),
  ): Promise<AgreementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const agreement = await this.lockAgreement(manager, agreementId);
      const version = await this.currentVersion(manager, agreement);
      const operation = await manager.findOne(ChainOperationEntity, {
        where: { id: chainOperationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !operation ||
        operation.status !== 'Confirmed' ||
        !operation.transactionHash
      )
        throw new ConflictException(
          'Funding requires a persisted confirmed chain operation',
        );
      const intent = operation.intent as Record<string, unknown>;
      if (
        intent.agreementId !== agreementId ||
        intent.termsHash !== version.economicTermsHash ||
        intent.network !== version.terms.network
      )
        throw new ConflictException(
          'Confirmed chain operation does not match agreement terms',
        );
      const target = confirmedStatus as AgreementStatus;
      this.assertTransition(agreement.status, target);
      await manager.getRepository(AgreementFinanceConfirmationEntity).save(
        manager.getRepository(AgreementFinanceConfirmationEntity).create({
          agreementId,
          chainOperationId,
          status: confirmedStatus,
          network: version.terms.network,
          transactionHash: operation.transactionHash,
          economicTermsHash: version.economicTermsHash,
          confirmedAt: now,
        }),
      );
      agreement.status = target;
      return manager.save(agreement);
    });
  }

  async transition(
    agreementId: string,
    target: AgreementStatus,
    now = new Date(),
  ): Promise<AgreementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const agreement = await this.lockAgreement(manager, agreementId);
      if (
        target === AgreementStatus.Accepted ||
        target === AgreementStatus.PendingAcceptance ||
        target === AgreementStatus.PartiallyFunded ||
        target === AgreementStatus.Funded
      )
        throw new ConflictException(
          'Target status requires its dedicated acceptance or chain confirmation flow',
        );
      this.assertTransition(agreement.status, target);
      if (target === AgreementStatus.Active) {
        const confirmation = await manager.findOne(
          AgreementFinanceConfirmationEntity,
          {
            where: { agreementId, status: 'Funded' },
            order: { confirmedAt: 'DESC' },
          },
        );
        if (!confirmation)
          throw new ConflictException(
            'Active status requires confirmed persisted funding',
          );
      }
      if (target === AgreementStatus.Expired) {
        const version = await this.currentVersion(manager, agreement);
        if (version.acceptanceExpiresAt.getTime() > now.getTime())
          throw new ConflictException('Agreement has not expired');
      }
      agreement.status = target;
      return manager.save(agreement);
    });
  }

  private async persistVersion(
    manager: EntityManager,
    agreement: AgreementEntity,
    actorUserId: string,
    input: AgreementVersionInput,
    versionNumber: number,
  ): Promise<AgreementVersionEntity> {
    const versionNonce = randomUUID();
    const repository = manager.getRepository(AgreementVersionEntity);
    return repository.save(
      repository.create({
        agreementId: agreement.id,
        version: versionNumber,
        terms: input.terms,
        economicTermsHash: canonicalEconomicTermsHash(
          input.terms,
          versionNonce,
        ),
        termsHash: canonicalAgreementTermsHash(input.terms, versionNonce),
        versionNonce,
        acceptanceExpiresAt: input.acceptanceExpiresAt,
        contractArtifactReference: input.contractArtifactReference.trim(),
        createdByUserId: actorUserId,
      }),
    );
  }

  private validateVersionInput(input: AgreementVersionInput): void {
    validateAgreementTermsShape(input.terms);
    if (!input.terms.network.trim() || !input.terms.asset.trim())
      throw new BadRequestException('Agreement network and asset are required');
    if (
      !Number.isFinite(input.acceptanceExpiresAt.getTime()) ||
      input.acceptanceExpiresAt <= new Date()
    )
      throw new BadRequestException(
        'Agreement acceptance deadline must be in the future',
      );
    if (!input.contractArtifactReference.trim())
      throw new BadRequestException('Contract artifact reference is required');
    const keys = new Set<string>();
    for (const party of input.terms.parties) {
      if (!party.key.trim() || keys.has(party.key))
        throw new BadRequestException(
          'Agreement party keys must be unique and non-empty',
        );
      keys.add(party.key);
      if (
        Boolean(party.organizationId) === Boolean(party.userId) ||
        !['Funder', 'Recipient', 'Verifier'].includes(party.role)
      )
        throw new BadRequestException(
          'Each party must identify exactly one user or organization',
        );
    }
    if (!input.terms.parties.some((party) => party.required))
      throw new BadRequestException(
        'At least one agreement party must be required',
      );
  }

  private async assertPartiesMatchAward(
    manager: EntityManager,
    award: AwardEntity,
    parties: AgreementParty[],
  ): Promise<void> {
    const source =
      award.sourceType === 'Project'
        ? await manager.findOne(ProjectEntity, {
            where: { id: award.sourceId },
          })
        : award.sourceType === 'Call'
          ? await manager.findOne(CallEntity, { where: { id: award.sourceId } })
          : null;
    if (!source) throw new NotFoundException('Award source was not found');

    let funder: { organizationId?: string; userId?: string };
    let recipient: { organizationId?: string; userId?: string };
    if (award.applicationId) {
      const application = await manager.findOne(ApplicationEntity, {
        where: { id: award.applicationId },
      });
      if (!application)
        throw new NotFoundException('Award Application was not found');
      if (
        application.sourceType !== award.sourceType ||
        application.sourceId !== award.sourceId ||
        source.direction !== 'FundingOffered'
      )
        throw new ConflictException(
          'Award Application does not match a FundingOffered source',
        );
      funder = {
        organizationId: source.ownerOrganizationId ?? undefined,
        userId: source.ownerUserId ?? undefined,
      };
      recipient = {
        organizationId: application.applicantOrganizationId ?? undefined,
        userId: application.applicantUserId ?? undefined,
      };
    } else if (award.fundingOfferId) {
      const offer = await manager.findOne(FundingOfferEntity, {
        where: { id: award.fundingOfferId },
      });
      if (!offer)
        throw new NotFoundException('Award FundingOffer was not found');
      if (
        offer.sourceType !== award.sourceType ||
        offer.sourceId !== award.sourceId ||
        source.direction !== 'FundingRequested'
      )
        throw new ConflictException(
          'Award FundingOffer does not match a FundingRequested source',
        );
      funder = {
        organizationId: offer.funderOrganizationId ?? undefined,
        userId: offer.funderUserId ?? undefined,
      };
      recipient = {
        organizationId: source.ownerOrganizationId ?? undefined,
        userId: source.ownerUserId ?? undefined,
      };
    } else {
      throw new ConflictException('Award has no source submission reference');
    }

    this.assertSinglePartyIdentity(funder, 'Funder');
    this.assertSinglePartyIdentity(recipient, 'Recipient');
    if (
      parties.filter((party) => party.role === 'Funder').length !== 1 ||
      parties.filter((party) => party.role === 'Recipient').length !== 1
    )
      throw new BadRequestException(
        'Agreement must identify exactly one Funder and one Recipient',
      );
    if (
      !this.hasRequiredParty(parties, 'Funder', funder) ||
      !this.hasRequiredParty(parties, 'Recipient', recipient)
    )
      throw new BadRequestException(
        'Agreement Funder and Recipient must match the Award source and submission',
      );
    if (
      (award.recipientOrganizationId ?? undefined) !==
        recipient.organizationId ||
      (award.recipientUserId ?? undefined) !== recipient.userId
    )
      throw new ConflictException(
        'Award recipient does not match its source submission facts',
      );
  }

  private assertSinglePartyIdentity(
    identity: { organizationId?: string; userId?: string },
    role: string,
  ): void {
    if (Boolean(identity.organizationId) === Boolean(identity.userId))
      throw new ConflictException(
        `Award ${role} identity is ambiguous or missing`,
      );
  }

  private hasRequiredParty(
    parties: AgreementParty[],
    role: AgreementParty['role'],
    identity: { organizationId?: string; userId?: string },
  ): boolean {
    return parties.some(
      (party) =>
        party.required &&
        party.role === role &&
        party.organizationId === identity.organizationId &&
        party.userId === identity.userId,
    );
  }

  private async assertPartyAuthority(
    manager: EntityManager,
    party: AgreementParty,
    actorUserId: string,
    now: Date,
  ): Promise<void> {
    const activeUser = await manager.findOne(UserEntity, {
      where: { id: actorUserId, status: 'Active' },
    });
    if (!activeUser)
      throw new ForbiddenException('An active user account is required');
    if (party.userId) {
      if (party.userId !== actorUserId)
        throw new ForbiddenException('Only the named user party may accept');
      return;
    }
    const organization = await manager.findOne(OrganizationEntity, {
      where: { id: party.organizationId!, status: 'Active' },
    });
    if (!organization)
      throw new ForbiddenException('Agreement organization is unavailable');
    const representative = await manager.findOne(
      OrganizationRepresentativeEntity,
      {
        where: {
          organizationId: organization.id,
          userId: actorUserId,
          revokedAt: IsNull(),
        },
      },
    );
    if (
      !representative ||
      representative.expiresAt.getTime() <= now.getTime() ||
      representative.verifiedAt.getTime() > now.getTime() ||
      !representative.verificationReference.trim()
    )
      throw new ForbiddenException(
        'Active representative authority is required',
      );
    const membership = await manager.findOne(OrganizationMembershipEntity, {
      where: {
        organizationId: organization.id,
        userId: actorUserId,
        role: 'Representative',
        status: 'Active',
      },
    });
    if (!membership)
      throw new ForbiddenException(
        'Active representative membership is required',
      );
  }

  private async assertPartyAuthorityForAny(
    manager: EntityManager,
    parties: AgreementParty[],
    actorUserId: string,
    now: Date,
  ): Promise<void> {
    for (const party of parties) {
      try {
        await this.assertPartyAuthority(manager, party, actorUserId, now);
        return;
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error;
      }
    }
    throw new ForbiddenException(
      'Active authority for a required Funder or Recipient party is required',
    );
  }

  private async currentVersion(
    manager: EntityManager,
    agreement: AgreementEntity,
  ): Promise<AgreementVersionEntity> {
    const version = await manager.findOne(AgreementVersionEntity, {
      where: { agreementId: agreement.id, version: agreement.currentVersion },
    });
    if (!version)
      throw new NotFoundException('Current agreement version was not found');
    return version;
  }

  private async lockAgreement(
    manager: EntityManager,
    id: string,
  ): Promise<AgreementEntity> {
    const agreement = await manager.findOne(AgreementEntity, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!agreement) throw new NotFoundException('Agreement was not found');
    return agreement;
  }

  private assertTransition(from: AgreementStatus, to: AgreementStatus): void {
    assertAgreementTransition(from, to);
  }
}

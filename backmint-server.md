# Backmint — Backend Functional & Domain Specification

**Document:** `backmint-server.md`  
**Version:** 1.0 · 2026-11-13  
**Status:** Product/architecture proposal, testnet MVP first  
**Primary technology:** NestJS, TypeScript, PostgreSQL, S3-compatible private storage, NEAR integration  
**Companions:** `backmint-app.md`, `backmint-contracts.md`

> **Canonical terminology is English.** Display text is localized. All money-management guarantees described here must be enforced **on-chain** rather than only by this server. Backmint cannot represent a commitment as deposited, an authorization as paid, or AI advice as a human decision.

## 0. Product model and boundaries

Backmint connects `Organizations` and eligible `Individuals` around two **independent** publication types:

- `Project`: a concrete initiative with its own objectives, proposed deliverables, team, costs, and possibly `fundingTarget`. It can exist without any `Call`. Its publisher may request support (`FundingRequested`) or offer compensation for others to execute it (`FundingOffered`).
- `Call`: a program/invitation with eligibility conditions, application requirements, review policy, capacity, and support terms; may offer (`FundingOffered`) or request (`FundingRequested`) support. No Project is a prerequisite for a Call.
- `Opportunity`: **read-model only** unifying Project and Call feeds; not a third canonical entity. Keys: `(sourceType, sourceId)`.
- `Application`: executor/candidate applies to `FundingOffered` Project or Call, with either a referenced Project or proposal contents. Publisher evaluates and may select it.
- `FundingOffer`: funder offers resources to `FundingRequested` Project or Call. The publisher evaluates and accepts/declines. This is distinct from an Application.
- `Award`: selection/acceptance decision. Not yet an enforceable payment or a deposit.
- `Agreement`: mutual acceptance of locked terms: parties, roles, asset, milestone schedule, verification authority, deadlines, cancellation, dispute/refund rules and legal terms. v1: 1 Award → 0 or 1 Agreement; later direct agreements and amendments.
- `FundingCommitment`: intent/promise, not a balance; `FundingDeposit`: externally confirmed receipt; `Disbursement`: finalized transfer.

**Separate states:** `visibility` = `Private | Unlisted | Public`; `intakeStatus` = `Open | Paused | Closed`; lifecycle state differs by resource; `fundingStatus` is a computed read model. Funding target is **informational unless** `hardCapEnabled` is true. Opening/closing intake never automatically changes visibility or existence.

**No aggregate completion percentage** for project impact or execution. Provide `approvedMilestones / totalMilestones`, amounts, due dates, decision records and evidence provenance. Money paid ≠ impact proven.

## 1. Bounded contexts and responsibilities

1. `Identity`: users, authenticated sessions, wallet associations, login recovery, account security.
2. `Organizations`: legal or informal entities, memberships, role assignments, representatives, KYB status.
3. `Verification`: verification requests, evidence/document reviews, status and expiry, sanctions/eligibility dependencies.
4. `Projects`: standalone initiative versions, objectives, owners, collaborators, visibility, target, incoming support settings.
5. `Calls`: independent programs, audience types, intake windows, quota, application templates, support allocation policies.
6. `Applications`: candidacies against FundingOffered objects, proposal snapshots, attachments, withdraw/resubmit policy.
7. `FundingOffers`: proposed support against FundingRequested objects; monetary/in-kind commitments and conditions.
8. `Evaluations`: human review, rubric, eligibility, reviewer assignments, AI summaries and recommendation provenance.
9. `Awards`: approved allocations with capacity/budget reservation, notification and expiry.
10. `Agreements`: acceptance workflow, immutable versioned commercial terms, on-chain economic terms hash.
11. `Milestones`: deliverables, submissions, evidence, reviewer decisions, dispute triggers.
12. `Finance`: wallets, deposits, transfers, escrow synchronization, ledger, reconciliation and refunds.
13. `Disputes`: case intake, evidence, arbitrator appointment, permitted remedies.
14. `Impact`: factual historical activity and sourced outcome claims; never invent completion scores.
15. `Embeds`: public widget configurations, host domain allowlists, public opportunity projections.
16. `Notifications`: event-driven inbox/email, retries, user preferences.
17. `Compliance`: country/asset restrictions, KYB/KYC gates, AML/sanctions checks, data retention and legal obligations.
18. `Audit`: immutable application-level event trail, privileged operation oversight and export.

**Ownership rule:** an upstream domain cannot mark another domain's authoritative event as completed. Example: Evaluation emits `ApplicationSelected`; Finance alone determines deposit confirmation, and NEAR determines actual settlement.

## 2. Core relational model (suggested)

Every record has UUID/ULID `id`, `createdAt`, `updatedAt` as appropriate; sensitive changes are versioned and audited. Prefer integer minor units / canonical asset base units over floating-point currency.

### Identity and Organizations

- `User(id, email?, displayName, status, locale, createdAt)`; one person may belong to many organizations.
- `IdentityProvider(id, userId, provider, subject, verifiedAt)`; allow wallet and conventional auth.
- `WalletLink(id, userId, network, accountId, verifiedAt, revokedAt)`; prove wallet control using challenge signature.
- `Organization(id, slug, name, organizationType, country, legalStatus, visibility, status, ownerUserId)`; types: `Company | Community | Foundation | Nonprofit | EducationalInstitution | Government | Other`; distinguish informal group from incorporated company.
- `OrganizationMembership(id, organizationId, userId, role, status, invitedBy, acceptedAt)`; unique active pair.
- `OrganizationRepresentative(id, organizationId, userId, capacity, verifiedAt, expiresAt)`; authority to bind an organization is distinct from admin access.
- `VerificationCase(id, subjectType, subjectId, category, status, provider, validUntil, reviewerId)`; statuses `NotStarted | Pending | NeedsInfo | Verified | Rejected | Expired | Revoked`.

### Publication and intake

- `Project(id, ownerOrganizationId?, ownerUserId?, title, description, version, direction, visibility, lifecycleStatus, intakeStatus, acceptApplications, acceptFunding, fundingTargetAmount?, targetAsset?, hardCapEnabled, hardCapAmount?, intakeOpensAt?, intakeClosesAt?, publishedAt)`.
- `ProjectVersion(id, projectId, version, snapshot, reason, publishedAt)`; submitted applications reference a snapshot.
- `Call(id, ownerOrganizationId, title, description, direction, visibility, lifecycleStatus, intakeStatus, audienceTypes[], maximumAwards?, allocationMode, fixedAwardAmount?, overallBudget?, supportTypes[], selectionMethod, intakeDates, publishedAt)`.
- `CallVersion(id, callId, version, snapshot, publishedAt)`.
- `EligibilityRule(id, sourceType, sourceId, audienceTypes[], jurisdictionRestrictions, minRequirements, verificationLevel, ruleVersion)`; evaluate against applicant **type and provenance**, not arbitrary account tags.
- `Questionnaire(id, sourceType, sourceId, version)` and `Question(id, questionnaireId, kind, label, required, options, validation, displayOrder)`.
- `OpportunityPolicy(id, sourceType, sourceId, maxApplicationsPerApplicant, allowReapply, maxAwards, selectionWindow, closingPolicy, fundingCapPolicy, disclosurePolicy)`.
- `ExternalEmbed(id, sourceType, sourceId, hostOrganizationId, allowedOrigins[], theme, mode, status)`.

### Participation, evaluation and selection

- `Application(id, sourceType, sourceId, applicantOrganizationId?, applicantUserId?, referencedProjectId?, sourceVersion, applicantSnapshotVersion, proposalSnapshot, status, submittedAt, withdrawnAt)`; only for `FundingOffered`.
- `ApplicationAnswer(id, applicationId, questionId, answer, attachmentIds[])`.
- `FundingOffer(id, sourceType, sourceId, funderOrganizationId?, funderUserId?, amount?, asset?, supportDescription?, conditionsSnapshot, status, submittedAt)`; only for `FundingRequested`.
- `EvaluationRound(id, sourceType, sourceId, stage, rubricVersion, status, openedAt, closedAt)`.
- `EvaluationAssignment(id, roundId, evaluatorUserId, applicationId?, fundingOfferId?, conflictDeclaration, status)`.
- `Evaluation(id, assignmentId, findings, rubricScores, eligibilityDecision, recommendation, notes, submittedAt)`; human-authored; audit changes.
- `AIReview(id, targetType, targetId, model, modelVersion, promptVersion, documentRefs[], outputJson, confidenceFlags, createdAt)`; advisory, cite specific source fields, no automated selection/payment authorization.
- `Award(id, sourceType, sourceId, applicationId?, fundingOfferId?, recipientId, supportType, amount?, asset?, capacitySlot, status, expiresAt, termsSnapshot)`; idempotent capacity/budget reservation.

### Financial lifecycle

- `Agreement(id, awardId, version, status, payerOrganizationId, payeeOrganizationId, assetId, network, contractedAmountBaseUnits, termsHash, chainAgreementId?, escrowAccountId?, expiresAt, disputePolicyVersion, refundPolicyVersion)`.
- `AgreementPartyAcceptance(id, agreementId, version, participantId, representativeUserId, acceptedAt, signatureReference, signedTermsHash)`; all required parties sign same hash.
- `Milestone(id, agreementId, sequence, title, acceptanceCriteria, amountBaseUnits, dueAt, reviewerAccountId, status, activeEvidenceVersion?, onChainMilestoneId)`.
- `EvidenceSubmission(id, milestoneId, version, submitterId, status, submittedAt, description)` and `EvidenceAsset(id, submissionId, storageKey, checksum, mimeType, visibility, scanStatus)`.
- `MilestoneReview(id, milestoneId, submissionId, reviewerId, verdict, notes, decidedAt, evidenceHash)`; decisions `Approved | Rejected | ChangesRequested`.
- `FundingCommitment(id, agreementId, funderId, amountBaseUnits, status)`; promises excluded from confirmed escrow.
- `FundingDeposit(id, agreementId, chainTxHash, eventIndex, amountBaseUnits, assetId, finalityStatus, confirmedAt)`; unique `(network, chainTxHash, eventIndex)`.
- `Disbursement(id, agreementId, milestoneId, recipientAccount, amountBaseUnits, operationId, chainTxHash?, status, confirmedAt?)`.
- `Refund(id, agreementId, recipientAccount, amountBaseUnits, authorizedBy, chainTxHash?, status)`.
- `FinanceJournalEntry(id, agreementId, operationId, entryType, amountBaseUnits, asset, state, recordedAt)`; reconciles commitment/deposited/available/reserved/paid/refunded/pending.
- `ChainOperation(id, idempotencyKey, operationType, agreementId, requestedBy, expectedStateVersion, payloadHash, transactionHash?, status, errorCode?, updatedAt)`.

### Supporting domains

- `Dispute(id, agreementId, milestoneId?, openedBy, grounds, status, arbitratorId, openedAt, resolvedAt)`; `DisputeResolution` describes scoped remedy.
- `OutcomeClaim(id, projectId, description, metricType, declaredValue?, evidenceId?, verifierId?, status)`; label `SelfReported | Reviewed | IndependentlyVerified`.
- `Notification`, `AuditEvent`, `ComplianceDecision`, `DomainOutboxEvent`, `ExternalIntegration`.

**Indexes/constraints:** unique slugs per defined scope, unique membership, unique external wallet claims where required, one active award slot per eligible selection, max-award and total-budget reservation serialized under transaction, unique deposit event, unique payout `operationId`, immutable submitted snapshots. Protect confidential rows by organization authorization in all queries.

## 3. State machines

### Project / Call

`Draft -> Published -> Active -> Completed | Cancelled -> Archived` (where supported). `visibility` and `intakeStatus` are **independent**, with separate actions to `open`, `pause`, `close`, `reopen` intake. A source can be public and have closed intake; funding target reached does not close intake unless publisher configured that rule.

### Application / FundingOffer

`Draft -> Submitted -> UnderReview -> Shortlisted | Rejected | Withdrawn -> Selected -> Awarded` with explicit permitted transitions; `NeedsInformation` can return to `Submitted`. Once awarded, changing the proposal creates a versioned amendment requiring reapproval. FundingRequested uses FundingOffer, not executor Application.

### Award

`Proposed -> Offered -> Accepted | Declined | Expired -> AgreementPending -> AgreementCreated`. Expired awards release reserved quota/budget; no funds presumed escrowed.

### Agreement

`Draft -> PendingAcceptance -> Accepted -> AwaitingFunding -> Funded -> Active -> Completed` plus `Cancelled | Disputed | Expired | PartiallyFunded` per economic policy. Chain-confirmed financial statuses override optimistic UI/server status.

### Milestone

`Pending -> Ready -> Submitted -> UnderReview -> Approved -> ReleasePending -> Paid`. On rejection: `ChangesRequested -> Resubmitted`, or `Rejected`; `Disputed` branches only through pre-authorized remedy. **Milestone Approved ≠ Paid**.

### Finance operation

`Prepared -> AwaitingSignature -> Submitted -> ChainPending -> Confirmed | Failed | Reverted | Unknown`. `Unknown` must retry inspection/reconcile, never blindly re-submit a transfer.

## 4. Authorization and trust model

- User actions are scoped to selected Organization and permission: owner, admin, project manager, evaluator, finance approver, verified legal representative, observer.
- A person may act for multiple organizations but must explicitly select acting capacity for each material action.
- Funder and evaluator may be the same entity by agreement; conflict-of-interest declarations must be logged.
- Only authorized organization reviewers can select/award. AI may produce notes but cannot change selection, sign legal terms or release funds.
- Public reads expose only published and disclosed fields. Unlisted requires link; private requires membership/explicit grant. A public listing does not expose private applications, assessment notes or evidence.
- Calls/Projects may accept organization types and optionally individuals; eligibility is checked at submission **and again** before award/financial activation.
- Legal acceptance requires a verified representative (production); organization admin role alone is insufficient.
- Backmint mediators may coordinate/support dispute cases but **never** gain unrestricted unilateral withdrawal rights.

## 5. Functional flows with errors

### F01. Organization onboarding

1. Register/login `User`; verify contact and wallet ownership (wallet optional until signing).
2. Create `Organization` with organizationType, country and legal/informal status.
3. Invite members; representatives prove authority at the required level.
4. Create `VerificationCase`; upload documents privately; redact and restrict access.
5. Status becomes `Verified` only after independent provider/reviewer confirmation; store expiry and revocation.
6. If verification pending, allow draft and exploratory features; block high-trust publishing/funding according to regional policy.

**Errors:** impersonation, duplicate organization, expired documents, revoked authority, sanctions restrictions; record denial reason without leaking sensitive signals.

### F02. FundingOffered publication

1. Organization creates Project **or** Call; source type never implicitly converts to the other.
2. Enter audience organizationTypes (one or many), location, eligibility, requested documents, proposal questionnaire.
3. Set selection `Single | Multiple | Limited`, maxAwardCount, per-award amount model `Fixed | Negotiated | SharedBudget`, total funding limits, application close/reopen policy.
4. Set funding mode `SingleMilestone | MultipleMilestones | AdvanceAndMilestones` and expected acceptance requirements (templates, final terms negotiated after selection).
5. Publish with frozen version; show funding as `Announced`, not `Deposited`, until chain confirmation.
6. Publish embed feed/link; disable new applications when intake closed, not when visibility changes.

**Errors:** invalid budget/quota/milestone sums, audience empty, close date in past, missing publisher authority, immutable published terms edited without new version.

### F03. Executor Application

1. Eligible applicant selects FundingOffered Project/Call and chooses existing Project reference or enters proposal.
2. Server checks intake, audience, country, verification tier, per-applicant limit, version, required answers and file scanning.
3. Submit creates immutable `Application` snapshot. Provide receipt and disclose whether submission is visible to other applicants (normally no).
4. Applicant may withdraw or amend only within source policy; amendments preserve prior versions.
5. If Project is attached, later updates to Project do not silently change submitted proposal.

**Errors:** closed intake, disallowed org type, unauthorized actor, duplicate submission beyond quota, missing fields, unavailable evidence.

### F04. FundingRequested publication and offers

1. Publisher creates standalone Project or Call set `direction=FundingRequested`, optional target, optional hard cap, acceptable support categories, funding offer intake.
2. Potential funder sends `FundingOffer` with amount, asset, conditions, optional restricted purpose. This is not an Application from an executor.
3. Publisher reviews offer; accepting creates Award and negotiated Agreement, subject to all parties signing.
4. Optional direct contribution is a **separate future product** and must not bypass Agreement and compliance controls.
5. Reaching target marks a display goal; accepting additional funding stops only if publisher closes intake or hard-cap policy is enforced.

**Errors:** amount > configured hard cap, unsupported assets or jurisdiction, contradictory terms, insufficient authorized signatories.

### F05. Human evaluation with AI assistant

1. Assign evaluator with organizational permission and conflict-of-interest declaration.
2. System generates eligibility prechecks; missing fields and mismatches displayed separately from judgment calls.
3. AI assistant summarizes Application/FundingOffer and references exact documents/criteria, including uncertainty and contradictory passages.
4. Evaluator inspects each submission individually, may filter by deterministic eligibility results, relevant criteria, stage, tags and reviewed status.
5. Evaluator fills rubric/notes; submits recommendation/selection according to policy; organization decision is final at this stage.
6. Quota and budget reservation occurs atomically to prevent over-award; selected applicant notified.

**Rules:** AI outputs untrusted and never executable instructions; minimize PII; use approved models and consent; don't call a model's relevance judgment an objectively verified percentage. Provide `Eligible`, `NeedsReview`, `Ineligible`, `MissingInformation` based on traceable criteria.

### F06. Award → Agreement

1. Confirm selected Award allocation, beneficiary, funder, asset and monetary/nonmonetary obligations.
2. Negotiate milestones, precise acceptance criteria, deadlines, approval identity, dispute authority, expiration, refunds and amendments.
3. Generate versioned Agreement commercial terms and canonical on-chain financial parameter digest; all required parties approve **same exact version/hash**.
4. Register/initialize chain agreement with bound participants and parameters; store chain id/tx status; verify finality.
5. Agreement becomes `AwaitingFunding`; no completion or payment granted on signature alone.

**Errors:** signer unauthorized, party accepts stale version, network mismatched, asset not allowed, milestone allocations > committed amount, chain deploy/init failed.

### F07. Deposit, milestone evidence, release

1. Finance displays agreement amount/asset and deposit instructions without exposing sensitive private keys.
2. Funder signs deposit; chain watcher independently verifies contract, asset, amount, account and finality (never trust client-supplied hash alone).
3. Agreement `Funded/Active` only upon confirmed deposit and agreed funding threshold.
4. Executor submits evidence through private object storage; compute checksum, scan file, version contents; reviewer notified.
5. AI may summarize evidence against acceptance criteria but cannot authorize the payout.
6. Human reviewer approves current evidence version; server verifies that reviewer was assigned and chain permission corresponds to review authority.
7. Reviewer/funder signs on-chain approval (or approved delegate proof under contract's authorization model); contract marks milestone Approved.
8. Authorized party requests release; contract enforces milestone and balance constraints; server observes and reconciles confirmed payout.
9. UI displays distinct `Approved`, `ReleasePending`, `Paid` and provides explorer link; never show a fictional execution percentage.

**Errors:** late evidence, virus scan failed, revoked approver, insufficient escrow, race/double release, chain pending, failed transfer, unsupported asset, malicious contract callback. Retry by operationId reconciliation, not by duplicate calls.

### F08. Withdrawal, cancellation, disputes and refunds

1. Any participant may raise issue according to Agreement terms, with evidence and requested remedy.
2. Freeze only affected funds/milestones under pre-authorized rules; no silent platform seizure.
3. Parties may mutually resolve; named arbitrator may determine authorized split/refund only if accepted in advance.
4. Create signed resolution document and chain authorization; execute refund/release in a controlled manner.
5. Record final chain movement and close case; financial and legal records retained per applicable law.

**Errors:** unauthorized arbitrator, dispute on already-paid milestone, funds exhausted, conflicting instructions, missing signed resolution. Timeouts have explicit fallback rather than indefinite inaccessible funds.

### F09. Public profiles and embeds

1. Fetch **public projection** of published Projects/Calls and organization details, filtered by visibility, legal/safety constraints.
2. Embed can show card, list and link; full authenticated submission occurs on Backmint origin in MVP.
3. Host origin allowlist, rate limit, script version, safe rendering, privacy-preserving analytics, accessibility and localization.
4. Closing application intake changes CTA/status but never implicitly removes public listing.

### F10. Metrics and impact

- Financial KPIs: funding `Announced`, `Committed`, `Deposited`, `Reserved`, `Disbursed`, `Refunded`, separately by asset, with source timestamp and transaction links.
- Operational: Calls/Projects published/active, eligible applications, selected awards, accepted agreements, verified deposits, milestones approved, milestones paid, disputes, processing duration.
- Impact claims: self-reported vs evidence-reviewed vs independently verified; never translate money disbursed into claimed lives impacted without supporting data.
- User privacy: minimum aggregation thresholds, no disclosure of private applicant performance or internal reviews.

## 6. Public API surface (illustrative; not fixed routes)

- Identity: current profile, wallets, challenges, membership selection.
- Organizations: create/update, invite, accept invite, membership roles, verification upload and case status.
- Projects/Calls: create/version/publish, eligibility, questionnaire, intake open/pause/close/reopen, public browse/read.
- Applications/FundingOffers: create draft, submit, withdraw, upload evidence, get receipt, view own history.
- Evaluations: queue, assign, AI summarize, eligibility findings, rubric and decision, conflict-of-interest.
- Awards: capacity status, issue, accept/decline, expire, start agreement.
- Agreements: create terms, accept version, prepare chain registration, view funding and milestone states.
- Finance: unsigned chain intent, transaction status, reconcile, finance journal, funding totals, refund actions.
- Milestones/Disputes: evidence submit, review, open case, resolution authorization.
- Embeds/Analytics: sanitized public feed, widget config, private dashboard, exports.

Use versioned OpenAPI contracts and generated TypeScript client; no mandatory `shared` repository. Assign idempotency keys to all monetary initiation endpoints and mutable decisions.

## 7. Architecture proposal

**Monolithic modular NestJS application**, feature-based domain boundaries; controllers/application services/domain entities/repositories/adapters. PostgreSQL owned by server, separate schemas/tables with transactions. Object storage via **private AWS S3** for legally sensitive docs; Cloudinary suitable for public images when configured. NEAR RPC/indexer adapter watches authoritative chain state; never let event ingestion modify chain authorizations. AI adapter (potentially NEAR AI Cloud) operates advisory workflows with consent and retention settings. Async workers/outbox process scans, notifications, chain reconciliation and aggregation.

Suggest folder layout:

```text
backmint-server/
  src/
    modules/
      identity/
      organizations/
      verification/
      projects/
      calls/
      applications/
      funding-offers/
      evaluations/
      awards/
      agreements/
      milestones/
      finance/
      disputes/
      impact/
      embeds/
      notifications/
      compliance/
      audit/
    infrastructure/
      persistence/
      object-storage/
      near/
      ai/
      jobs/
    common/  # generic primitives only, no cross-domain business logic
  migrations/
  tests/
  docs/
```

`backmint-contracts` is a separately built/deployed Rust repository. Backend imports contract interface schemas/artifacts at versioned release, never executes Rust WASM internally.

## 8. Security, privacy, consistency

- Threat model: malicious applicant uploads, fake organizations, impersonation, prompt injection, forged evidence, approval spoofing, double payout, replay, stale contracts, deposit misattribution, RPC/indexer inconsistency, administrator misuse.
- JWT/session security, CSRF on cookie auth, RBAC + resource-level ABAC, least privilege, audit privileged actions and periodic access review.
- Signed URL uploads, malware scan/quarantine, checksum, content-type and size checks, private buckets, encryption and retention/deletion policy.
- No PII on public ledger; store only necessary hashes, opaque IDs and chain financial state. Hash of low-entropy personal data can leak identity; hash canonical terms with nonce/domain separation as needed.
- Fund transactions require explicit actor authority and signing; backend credentials must never allow arbitrary user fund transfer.
- Reconciliation worker compares chain logs **and state** after finality, handles reorg/finality and retries idempotently; external requests can return `Pending`.
- Outbox ensures domain changes and async notifications are retryable. Don't publish `FundsReleased` until observed on-chain finality.
- Production: KYB/KYC/sanctions/AML checks by country and activity, legal classification of custody/payment service, contract and infrastructure audits, incident response, operational key custody/recovery, tax and accounting workflows.

## 9. Acceptance criteria and testing

**E2E acceptance stories:**

1. Create an organization and independent FundingOffered Call; allowed applicant organization submits; mismatched type is rejected.
2. Fund a standalone Project without creating a Call; offers follow FundingRequested flow, **not** executor Application.
3. Set multiple awards with cap 2, concurrently approve 3 Applications; server atomically prevents third selection.
4. Set funding target 100 units, reach 100, leave intake open when no hard cap, keep public visibility; manual close/reopen doesn't erase project.
5. Evaluation AI provides summary with evidence citations; human decides differently; AI cannot bypass decision.
6. Selected Application generates Award, parties sign same Agreement version; a changed term invalidates previous acceptance.
7. Blockchain deposit is verified; client-submitted fake tx is rejected; available balance reflects confirmed chain funds.
8. Reviewer approves milestone; attempt release before approval fails on-chain; accepted release paid exactly once.
9. Simulate chain transfer failure; server displays Pending/Failed and does not double-submit.
10. Dispute freezes only scoped milestone; authorized resolution releases/refunds per contract permissions.
11. Public embed shows Project/Call status and CTA but cannot retrieve private review/evidence.
12. Finance and impact dashboards separate deposited vs disbursed and claimed vs verified outcomes.

Unit test domain invariants, integration test PostgreSQL uniqueness/transactions, security test permissions per organization, E2E test with NEAR sandbox/testnet, and snapshot-test API/client types. All financial balance arithmetic must use integer/base-unit types.

## 10. Prioritized delivery

**Hackathon MVP (testnet only):** single Organization funder + one applicant, FundingOffered Call or Project, applicant application, human selection, one Award, signed Agreement with 1–2 milestones, NEAR escrow funding, evidence upload, authorized approval, payout and transaction history, public embed card. Simplify KYB with clearly marked demo status; no legal live-funds promise.

**V1:** Projects and Calls both directions, multiple awards, dynamic forms, permissioned reviewers, AI assistance with citations, immutable versions, organization verification, dispute process, project-funder matching, public profiles and reporting.

**V2:** multiple funding sources, regional compliance policy engine, regulated fiat on/off ramps, white-label embeds, multilingual organizations, audited arbitration, grants/education templates, cross-chain settlement, enterprise analytics.

## 11. Cross-repository integration protocol

- `backmint-app`: display and collect requests, wallet signatures and upload UI; never authoritative over eligibility or balances.
- `backmint-server`: business/process authority; verifies chain and orchestrates milestones; never assumes a submitted tx is final.
- `backmint-contracts`: final authority for escrow custody rules and on-chain movement; not authority for subjective project quality or legal identity.
- Share canonical IDs, status mappings, asset units, contract version/ABI, network and event definitions in **versioned generated artifacts**; update companion specs whenever changing a domain event or financial invariant.


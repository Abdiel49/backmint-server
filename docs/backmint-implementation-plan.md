# Backmint implementation plan

Source of truth: `backmint-server.md` version 1.0. This plan covers the testnet MVP, V1 and V2 scope defined there. Canonical domain and API terminology remains English.

## Tracking protocol

- [ ] Not started
- [~] In progress
- [x] Completed and verified
- [!] Failed or blocked

Every unchecked task must retain its completion criteria and failure record. When a task fails, replace its state with `[!]` and add this exact record below it:

`Failure: FAILED — <UTC timestamp> — <failed criterion or error> — <impact> — <owner> — <next action or blocking dependency>.`

Do not mark a financial task complete from an HTTP success response alone. Its completion evidence must include the authoritative persisted state and, where applicable, NEAR finality evidence.

## Global delivery rules

- [ ] Keep every feature on a branch created from `develop`, commit each completed feature, and open a PR to `develop`.
  - Done when: branch, commit, PR URL and review state are linked from the task or release record.
  - Failure: FAILED — <UTC timestamp> — workflow evidence is missing — traceability is incomplete — <owner> — create or link the missing artifact.
- [ ] Keep code, database identifiers, OpenAPI operation names, events and statuses in English.
  - Done when: lint/review finds no non-localized business identifiers outside English terminology.
  - Failure: FAILED — <UTC timestamp> — non-canonical identifier found — client/domain mismatch risk — <owner> — rename and regenerate contracts.
- [~] Document every HTTP endpoint in Swagger/OpenAPI with realistic request and success/error examples.
  - Done when: the generated OpenAPI document is versioned and snapshot-tested.
  - Failure: FAILED — <UTC timestamp> — endpoint or example absent from OpenAPI — client contract incomplete — <owner> — add decorators and snapshot.
- [~] Use integer minor units or canonical asset base units for all financial amounts.
  - Done when: schema, DTOs, services and contract adapters reject floating-point money values.
  - Failure: FAILED — <UTC timestamp> — floating-point amount accepted — balance precision risk — <owner> — replace with integer/base-unit representation.
- [ ] Never represent a commitment as deposited, an authorization as paid, or AI advice as a human decision.
  - Done when: read models, API responses and UI projections expose distinct authoritative statuses.
  - Failure: FAILED — <UTC timestamp> — status conflation detected — misleading financial or governance state — <owner> — correct projection and backfill audit record.

## Phase 0 — Foundation and delivery environment

- [x] Maintain typed, validated environment configuration for application, PostgreSQL, Redis, S3-compatible object storage, NEAR RPC, CORS, rate limits and observability.
  - Done when: startup fails with actionable validation errors for missing/invalid required values and no application service reads `process.env` directly.
  - Failure: FAILED — <UTC timestamp> — configuration validation or injection failed — service cannot start safely — <owner> — fix schema/defaults and add regression test.
- [x] Maintain Docker Compose development services for PostgreSQL and Redis with health checks and persistent database volume.
  - Done when: `docker compose up -d` reports healthy dependencies and the e2e suite can connect to both services.
  - Failure: FAILED — <UTC timestamp> — dependency container unhealthy — local integration unavailable — <owner> — inspect service logs and repair Compose/environment configuration.
- [x] Configure TypeORM migrations, migration generation, migration execution and a no-`synchronize` production policy.
  - Done when: a blank database can be migrated up and down in CI; production startup never mutates schema automatically.
  - Evidence: [PR #38](https://github.com/Abdiel49/backmint-server/pull/38) passes CI, including blank-database up/down/up verification followed by normal migration execution.
  - Evidence: `scripts/verify-migrations.js` applies every migration, rolls them all back, and reapplies them against a blank PostgreSQL database. GitHub Actions now runs this job; its first pull-request result is pending.
  - Failure: FAILED — <UTC timestamp> — migration is non-reproducible or destructive — schema deployment unsafe — <owner> — repair migration and test from an empty database.
- [x] Configure global HTTP rate limiting with stricter policies for authentication, uploads, financial initiation and public embeds.
  - Done when: integration tests prove normal requests pass, abusive requests receive `429`, and health probes remain available.
  - Failure: FAILED — <UTC timestamp> — rate policy is bypassed or blocks health probes — abuse/availability risk — <owner> — correct guard/decorator configuration.
- [x] Configure CORS, trusted proxy policy, graceful shutdown and structured request/error logging.
  - Done when: only configured origins receive credentialed responses, shutdown closes cleanly, and request IDs are present in logs.
  - Failure: FAILED — <UTC timestamp> — cross-origin or shutdown policy incorrect — security/availability risk — <owner> — correct bootstrap configuration and add integration coverage.
- [x] Configure event emitter, scheduler and BullMQ/Redis queues for notifications, malware scans, chain reconciliation, aggregation and retryable delivery.
  - Done when: producers and consumers use named queues, retries/backoff/dead-letter behavior is tested, and no job performs an unbounded retry.
  - Failure: FAILED — <UTC timestamp> — job is lost, duplicated or retries indefinitely — asynchronous consistency risk — <owner> — fix idempotency/retry policy and replay safely.
- [~] Configure a transactional outbox for domain events that leave PostgreSQL.
  - Done when: a domain write and outbox event commit atomically; a worker can retry delivery without duplicate effects.
  - Failure: FAILED — <UTC timestamp> — event can publish without committed state or be lost after commit — cross-domain inconsistency — <owner> — repair transaction boundary and add failure simulation.
- [~] Configure private S3-compatible storage with encryption, bucket policy, restricted credentials, checksum metadata and signed URL generation.
  - Done when: a service can issue scoped, short-lived upload/download URLs without exposing bucket credentials to clients.
  - Evidence: [PR #8](https://github.com/Abdiel49/backmint-server/pull/8) provides scoped short-lived presigned upload/download URLs, server-side encryption, checksum metadata, and configured credentials. Bucket policy enforcement, credential scoping/rotation, object scan completion and live S3 integration verification remain pending.
  - Failure: FAILED — <UTC timestamp> — object access is public or credentials leak — sensitive-evidence exposure — <owner> — revoke credentials, repair policy and audit access.
- [x] Configure the NEAR RPC adapter for testnet, contract ID/version configuration, finality-aware queries and resilient retries.
  - Done when: the adapter reads network identity, contract state and transaction outcome using configured testnet endpoints.
  - Failure: FAILED — <UTC timestamp> — RPC/contract configuration mismatch — chain state cannot be trusted — <owner> — correct network, contract artifact or provider settings.

## Phase 1 — Shared domain primitives and persistence

- [~] Define UUID or ULID primary key policy, UTC timestamp policy, optimistic state version policy and migration naming convention.
  - Done when: every new aggregate migration applies the shared identifiers and timestamps consistently.
  - Failure: FAILED — <UTC timestamp> — aggregate violates persistence convention — audit/migration inconsistency — <owner> — align entity and migration.
- [~] Define enums and transition guards for visibility, intake, lifecycle, application, offer, award, agreement, milestone, finance and verification states.
  - Done when: illegal transitions are rejected by unit tests and transition events are audited.
  - Failure: FAILED — <UTC timestamp> — illegal transition accepted — workflow integrity risk — <owner> — add guard and regression test.
- [~] Define immutable snapshot/version primitives for published sources, submitted proposals, agreement terms and evidence submissions.
  - Done when: modifying a source cannot mutate a previously submitted or signed snapshot.
  - Failure: FAILED — <UTC timestamp> — historical snapshot changed — consent/audit integrity loss — <owner> — restore immutable versioning and backfill affected records.
- [~] Define domain event, audit event, idempotency key and external integration record primitives.
  - Done when: privileged and external side effects carry actor, correlation, causation and idempotency metadata.
  - Failure: FAILED — <UTC timestamp> — side effect lacks traceability/idempotency — reconciliation impossible — <owner> — add metadata and replay protection.
- [x] Define authorization primitives for acting organization, membership role, representative authority, resource ownership and explicit grants.
  - Done when: policies can distinguish a person from their selected organizational capacity.
  - Failure: FAILED — <UTC timestamp> — actor capacity is ambiguous — unauthorized action risk — <owner> — require acting organization and policy evaluation.

## Phase 2 — Identity, authentication, organizations and verification

- [~] Implement `User` and `IdentityProvider` persistence, registration/login/recovery flows, sessions/tokens and account security controls.
  - Done when: authenticated identity is established through a verified provider and session revocation/recovery is tested.
  - Evidence: [PR #21](https://github.com/Abdiel49/backmint-server/pull/21) persists users/verified identities, [PR #23](https://github.com/Abdiel49/backmint-server/pull/23) adds revocable sessions, and [PR #40](https://github.com/Abdiel49/backmint-server/pull/40) adds authenticated current-session and revocation endpoints. Public registration, provider login and account recovery remain pending an external identity-verification integration.
  - Failure: FAILED — <UTC timestamp> — identity/session flow allows impersonation or unrecoverable access — account security risk — <owner> — disable affected flow and remediate.
- [x] Implement authenticated wallet challenge issuance, account-owner signature verification, `WalletLink` listing and revocation.
  - Done when: only a verified account owner can link a wallet; reused or expired challenges fail.
  - Evidence: [PR #51](https://github.com/Abdiel49/backmint-server/pull/51) adds bearer-authenticated `/auth/wallet/challenges` and `/auth/wallet/links` endpoints. Challenges are bound to the session user, use the server-configured NEAR network and recipient, expire after five minutes, persist only the nonce hash, and are atomically consumed once. Link creation verifies the NEP-413 signature and confirms the signing key has FullAccess on the account through the configured NEAR RPC. Wallet links persist their configured network and enforce active-account uniqueness within that network. Listing and revocation are scoped to the authenticated user. External provider login and public registration/recovery remain pending; wallet linking does not authenticate a new user or create a session. Build, lint and all 177 unit tests pass locally; CI is running. Local migration up/down/reapply verification requires PostgreSQL and environment configuration unavailable in this worktree.
  - Failure: FAILED — <UTC timestamp> — wallet control cannot be proven — forged wallet association risk — <owner> — invalidate challenges and repair verification.
- [~] Implement `Organization`, unique scoped slug, country, type, legal/informal status, visibility and owner selection.
  - Done when: duplicate/invalid organizations are rejected and ownership is auditable.
  - Failure: FAILED — <UTC timestamp> — organization uniqueness or owner rule fails — identity collision risk — <owner> — repair constraint and reconcile duplicates.
- [x] Implement organization invitations, `OrganizationMembership`, active-pair uniqueness, acceptance and role lifecycle.
  - Done when: memberships support owner, admin, project manager, evaluator, finance approver, representative and observer policies.
  - Evidence: [PR #26](https://github.com/Abdiel49/backmint-server/pull/26) is merged. Membership persistence, active-pair uniqueness, invitation acceptance and role lifecycle are implemented; HTTP onboarding endpoints remain pending.
  - Failure: FAILED — <UTC timestamp> — membership grants incorrect access — authorization risk — <owner> — revoke excess membership and repair policy.
- [x] Implement `OrganizationRepresentative` and authority expiration/revocation checks distinct from admin access.
  - Done when: only currently verified representatives may accept legal terms in production mode.
  - Evidence: [PR #26](https://github.com/Abdiel49/backmint-server/pull/26) is merged. Representative authority is distinct from membership roles and supports expiry/revocation checks; acceptance integration remains pending with Agreements.
  - Failure: FAILED — <UTC timestamp> — non-representative can bind an organization — legal authority risk — <owner> — block acceptance and audit prior actions.
- [~] Implement private verification document uploads, `VerificationCase`, reviewer workflow, expiry and revocation.
  - Done when: verification transitions support `NotStarted`, `Pending`, `NeedsInfo`, `Verified`, `Rejected`, `Expired` and `Revoked` without leaking sensitive denial signals.
  - Evidence: [PR #31](https://github.com/Abdiel49/backmint-server/pull/31) is merged. Verification cases, scoped private object references, reviewer decision history, self-review prevention, hourly expiry and role/resource access checks are implemented.
  - Limitation: authenticated HTTP endpoints, actual signed-upload completion, malware scanning and applicant-submission gating remain pending.
  - Failure: FAILED — <UTC timestamp> — verification evidence/status is exposed or transition invalid — privacy/compliance risk — <owner> — restrict access and repair workflow.
- [~] Implement authentication and authorization packages with JWT/session guards, CSRF protection for cookie flows, RBAC plus resource-level ABAC.
  - Done when: every protected endpoint has policy tests for self, teammate, other organization and anonymous users.
  - Evidence: [PR #40](https://github.com/Abdiel49/backmint-server/pull/40) documents Bearer-session security and tests anonymous, cookie-only, owner and role denials. Cookie authentication is explicitly rejected; CSRF protection is therefore not applicable to these routes. Resource policies for the remaining protected resources and provider-authenticated login remain pending.
  - Failure: FAILED — <UTC timestamp> — protected resource is accessible without valid policy — data/financial authorization risk — <owner> — disable route and repair guard.

## Phase 3 — Projects, Calls and public opportunity read model

- [x] Implement `Project` and `ProjectVersion` as independent aggregates with owner, objectives, costs, direction, target, visibility, lifecycle and intake state.
  - Done when: a Project can exist without a Call and published changes create immutable versions.
  - Failure: FAILED — <UTC timestamp> — Project requires/corrupts Call relationship — invalid product model — <owner> — separate aggregate and migrate data.
- [x] Implement `Call` and `CallVersion` as independent aggregates with audience, capacity, allocation policy, support terms, intake window and publication state.
  - Done when: a Call can exist without a Project and preserves its own published versions.
  - Failure: FAILED — <UTC timestamp> — Call is coupled to Project or mutable after publication — invalid program model — <owner> — repair boundary/versioning.
- [x] Implement visibility (`Private`, `Unlisted`, `Public`) independently from intake (`Open`, `Paused`, `Closed`) and lifecycle transitions.
  - Done when: open/pause/close/reopen changes intake only; public status does not reveal private participation data.
  - Failure: FAILED — <UTC timestamp> — intake action changes visibility/lifecycle unexpectedly — disclosure or workflow error — <owner> — restore independent state transition.
- [~] Implement funding direction rules: `FundingOffered` accepts Applications and `FundingRequested` accepts FundingOffers.
  - Done when: cross-direction submission types are rejected at API and domain layers.
  - Failure: FAILED — <UTC timestamp> — wrong submission type accepted — financial workflow ambiguity — <owner> — reject/migrate invalid record.
- [~] Implement informational funding target and optional hard-cap policy without auto-closing intake unless configured.
  - Done when: reaching a soft target preserves configured visibility/intake; hard cap enforces its explicit rule.
  - Failure: FAILED — <UTC timestamp> — target incorrectly closes intake or hard cap is bypassed — funding policy violation — <owner> — repair projection/constraint.
- [~] Implement `EligibilityRule`, `Questionnaire`, `Question`, `OpportunityPolicy` and validation for audience type, jurisdiction, verification level, quotas and dates.
  - Done when: publication rejects empty audience, invalid budget/quota, invalid dates and policy contradictions.
  - Failure: FAILED — <UTC timestamp> — invalid opportunity policy publishes — eligibility/budget risk — <owner> — unpublish/fix version and add validation.
- [x] Implement public `Opportunity` projection that unifies Projects and Calls by `(sourceType, sourceId)` without creating a third write aggregate.
  - Done when: public browse/read has stable filtering/pagination and never exposes confidential fields.
  - Failure: FAILED — <UTC timestamp> — projection leaks private data or becomes a write source — privacy/domain-boundary violation — <owner> — disable projection and repair query model.

## Phase 4 — Applications and FundingOffers

- [~] Implement `Application`, `ApplicationAnswer`, proposal snapshots, project reference option, attachments and receipt generation for `FundingOffered` sources.
  - Done when: submission stores the source/version and applicant snapshot atomically and immutably.
  - Evidence: [PR #33](https://github.com/Abdiel49/backmint-server/pull/33) is merged. Includes atomic Application/Answer persistence, database-enforced immutable snapshots/answers, source-version and applicant snapshots, optional Project reference and unique receipt. Attachments are retained as pending-scan references; no scan completion workflow exists yet. No HTTP route is exposed before authenticated actor context is available.
  - Failure: FAILED — <UTC timestamp> — submitted proposal is mutable or missing source version — review integrity risk — <owner> — restore snapshot and block amendment.
- [~] Enforce application intake, applicant type, country, verification, per-applicant quota, required answers, file scan status and eligibility at submission and again before award.
  - Done when: each rejection has a safe, traceable reason and no sensitive signal is disclosed publicly.
  - Evidence: submission enforces direction, publication lifecycle/intake/window, available organization type/country rules, required/question-option validation, duplicate and configured per-applicant quotas. Jurisdiction rules fail closed without applicant country; verification status is not captured in the applicant snapshot and is not yet integrated. Attachments set `PendingFileScan`. Award-time revalidation remains pending because awards do not exist.
  - Failure: FAILED — <UTC timestamp> — ineligible/duplicate application accepted — selection integrity risk — <owner> — invalidate submission and repair rule evaluation.
- [~] Implement withdrawal, amendment, resubmission and prior-version retention according to source policy.
  - Done when: amendments never overwrite prior submitted content and disallowed changes are rejected.
  - Evidence: submitted snapshots and answers are immutable; withdrawal, amendment, resubmission and application state transitions are not implemented.
  - Failure: FAILED — <UTC timestamp> — amendment breaks policy/history — audit integrity risk — <owner> — restore version and correct transition.
- [~] Implement `FundingOffer` for `FundingRequested` sources, including asset, amount, in-kind support, conditions and restricted purpose.
  - Done when: offers reject unsupported assets, over-hard-cap values, prohibited jurisdictions and contradictory terms.
  - Evidence: `feature/applications-funding-offers` persists integer base-unit amount, asset, in-kind support type, condition/restricted-purpose snapshots and source version; validates direction, intake, publication asset, eligibility/jurisdiction where source rules and organization country are available, and per-offer hard cap. A configured asset allowlist and complete prohibited-jurisdiction/compliance policy are not present.
  - Failure: FAILED — <UTC timestamp> — invalid offer accepted — funding/compliance risk — <owner> — void offer and repair validation.
- [~] Implement FundingOffer review, acceptance/decline and conversion to Award plus negotiated Agreement, without treating an offer as a deposit.
  - Done when: accepted offer is visibly `Award`/`AgreementPending` until chain-confirmed deposit.
  - Evidence: offers can be submitted, moved under review, accepted or declined by an active source-owner organization Owner/Admin/Evaluator or source owner user; accepted offers are not displayed as deposited, and aggregate accepted amount respects a configured hard cap. Award and Agreement aggregates do not exist, so conversion is not implemented.
  - Failure: FAILED — <UTC timestamp> — offer shown as funded/deposited — misleading balance state — <owner> — correct read model and audit notification.

## Phase 5 — Evaluations, AI assistance and awards

- [~] Implement `EvaluationRound`, `EvaluationAssignment`, conflict declaration, rubric version, queue filtering and reviewer permissions.
  - Done when: reviewers can only view assigned/authorized material and conflicts are recorded before decision.
  - Evidence: [PR #35](https://github.com/Abdiel49/backmint-server/pull/35) is merged. Organization-scoped rounds, evaluator-role checks, assignment-only queues, conflict declarations, immutable rubric snapshots and queue filters are implemented. Authenticated HTTP routes and award transition remain pending.
  - Evidence: commit `40c71c0` on `feature/human-evaluation-foundations`; [PR #35](https://github.com/Abdiel49/backmint-server/pull/35) targets `develop`. Adds organization-scoped round management, active evaluator-role checks, assignment-only reviewer queues, self/organization conflict prevention, one-time conflict declarations, immutable rubric snapshots and queue filters for source, status, eligibility and reviewed state. Service layer only; authenticated HTTP routes remain pending.
  - Failure: FAILED — <UTC timestamp> — unauthorized review or undeclared conflict — governance/privacy risk — <owner> — revoke assignment and audit access.
- [~] Implement human `Evaluation` with findings, rubric scores, eligibility decision, recommendation, notes and immutable audit history.
  - Done when: submitted evaluation changes are versioned/audited and human decision remains authoritative.
  - Evidence: [PR #35](https://github.com/Abdiel49/backmint-server/pull/35) is merged. Human decisions are append-only, versioned and transactionally serialized per assignment; award transition and route-level actor authorization remain pending.
  - Evidence: commit `40c71c0` on `feature/human-evaluation-foundations`; [PR #35](https://github.com/Abdiel49/backmint-server/pull/35) targets `develop`. Persists append-only, versioned human decisions with findings, non-negative rubric scores, eligibility decision, recommendation, notes and separately stored deterministic eligibility output. Database triggers reject evaluation history mutation; review submission is transactionally serialized per assignment. No Award transition is wired.
  - Failure: FAILED — <UTC timestamp> — evaluation is silently mutable or automated — decision integrity risk — <owner> — freeze record and restore audit trail.
- [~] Implement `AIReview` as advisory output with model/version, prompt version, source document references, uncertainty flags, consent and retention controls.
  - Done when: AI output cites specific source fields and cannot invoke selection, agreement, payment or chain actions.
  - Evidence: [PR #39](https://github.com/Abdiel49/backmint-server/pull/39) adds immutable advisory records, verified citations to application data, uncertainty flags, explicit individual consent and configurable retention. It has no provider/generation flow; organizational representative consent, PII review and live factual-quality validation remain pending.
  - Failure: FAILED — <UTC timestamp> — AI output is uncited, leaks PII or triggers action — safety/privacy risk — <owner> — disable workflow, purge per policy and remediate prompt/access path.
- [~] Implement deterministic eligibility findings: `Eligible`, `NeedsReview`, `Ineligible`, `MissingInformation`.
  - Done when: each result is reproducible from stored rules and inputs, separate from subjective reviewer scoring.
  - Evidence: [PR #35](https://github.com/Abdiel49/backmint-server/pull/35) is merged. Evaluations persist deterministic findings separately from human decisions; complete profile/verification input capture and pre-award re-evaluation remain pending.
  - Evidence: commit `40c71c0` on `feature/human-evaluation-foundations`; [PR #35](https://github.com/Abdiel49/backmint-server/pull/35) targets `develop`. Human evaluation stores output from `evaluateEligibility` using the Application/FundingOffer publication and applicant snapshots and Application answers, separately from the human decision. Verification and other profile data not present in current submission snapshots remain `MissingInformation`; complete input capture and pre-award re-evaluation remain pending.
  - Failure: FAILED — <UTC timestamp> — eligibility cannot be explained/reproduced — decision traceability failure — <owner> — correct evaluator and reprocess affected cases.
- [ ] Implement `Award` creation from Application or FundingOffer with allocation, asset, recipient, expiry and terms snapshot.
  - Done when: award is not treated as an enforceable payment/deposit and supports accept/decline/expiry transitions.
  - Failure: FAILED — <UTC timestamp> — award changes financial state prematurely — financial misrepresentation — <owner> — correct state/event projections.
- [ ] Serialize capacity slot and total budget reservation in PostgreSQL transactions.
  - Done when: concurrent approval attempts cannot exceed `maxAwards` or budget; expired/declined awards release reservation exactly once.
  - Failure: FAILED — <UTC timestamp> — over-award or double release detected — allocation integrity breach — <owner> — freeze allocations, reconcile and fix transaction locking.

## Phase 6 — Agreements and terms acceptance

- [ ] Implement `Agreement`, versioned terms, party roles, asset/network, milestones, verification authority, deadlines, cancellation/dispute/refund policy and legal terms.
  - Done when: one Award maps to zero or one Agreement in V1 and agreement versions are immutable.
  - Failure: FAILED — <UTC timestamp> — agreement terms are ambiguous/mutable or award has multiple active agreements — legal/financial integrity risk — <owner> — lock records and repair mapping.
- [ ] Generate canonical on-chain economic terms hash with domain separation/nonce policy and persist contract artifact/version reference.
  - Done when: hash can be reproduced from the exact accepted terms and differs for stale/amended versions.
  - Failure: FAILED — <UTC timestamp> — terms hash mismatch — chain/legal agreement divergence — <owner> — stop chain registration and regenerate verified terms.
- [ ] Implement `AgreementPartyAcceptance` with representative authorization, exact version/hash signature, expiry and stale-version rejection.
  - Done when: all required parties accepted the same hash before agreement reaches `Accepted`.
  - Failure: FAILED — <UTC timestamp> — unauthorized or stale acceptance accepted — invalid consent — <owner> — invalidate acceptance and require re-signing.
- [ ] Implement Agreement state machine: `Draft`, `PendingAcceptance`, `Accepted`, `AwaitingFunding`, `PartiallyFunded`, `Funded`, `Active`, `Completed`, `Cancelled`, `Disputed`, `Expired`.
  - Done when: transition permissions and chain-confirmed financial overrides are unit/integration tested.
  - Failure: FAILED — <UTC timestamp> — illegal agreement transition — financial/legal workflow breach — <owner> — halt affected workflow and repair transition guard.

## Phase 7 — NEAR finance, escrow and reconciliation

- [ ] Version and validate imported contract interface artifacts from `backmint-contracts`; never execute contract WASM in this server.
  - Done when: server adapter validates expected contract ID, ABI/spec version and network before each operation.
  - Failure: FAILED — <UTC timestamp> — contract interface/network mismatch — unsafe chain interaction — <owner> — disable operations and update verified artifact.
- [~] Implement `ChainOperation` with idempotency key, operation type, state version, payload hash, requester, transaction hash, error code and lifecycle.
  - Done when: mutable/financial initiations can return `Pending` and retries reconcile the same operation instead of resubmitting blindly.
  - Evidence: [PR #36](https://github.com/Abdiel49/backmint-server/pull/36) is merged. Operations persist requester-scoped idempotency keys, immutable payload hashes, guarded state transitions and audit events; identical retries return the existing operation. Chain submission, agreement binding and finality reconciliation remain pending.
  - Failure: FAILED — <UTC timestamp> — operation can duplicate submission — double-payment risk — <owner> — freeze operation type and repair idempotency path.
- Evidence: `feature/chain-operation-intents` persists versioned operations with requester-scoped idempotency, immutable payload hashes, guarded compare-and-swap transitions and audit events. Identical retries return the original operation; no transaction submission code exists. Agreement binding, automatic retry reconciliation and finality remain pending.
- [~] Implement unsigned transaction intent generation only; require explicit authorized wallet signature for all fund-moving actions.
  - Done when: backend credentials cannot arbitrarily transfer user funds.
  - Evidence: [PR #36](https://github.com/Abdiel49/backmint-server/pull/36) is merged. Unsigned function-call intent fields are validated for the configured network/contract, and the server has no signer or broadcast path. Authenticated finance API exposure and wallet authorization remain pending.
  - Failure: FAILED — <UTC timestamp> — backend can initiate unrestricted user transfer — custody/security incident — <owner> — revoke credentials and disable transaction path.
- Evidence: unsigned `FunctionCall` intent fields are validated and restricted to the configured NEAR network and contract. The server has no signing key, signer or broadcast path. Authorized API exposure and explicit wallet authorization depend on agreement artifacts and authenticated finance APIs.
- [ ] Implement agreement registration/initialization on NEAR and finality-aware confirmation.
  - Done when: chain agreement ID/status is persisted only after expected contract, participants and terms hash are verified.
  - Failure: FAILED — <UTC timestamp> — chain agreement mismatches server terms — escrow integrity risk — <owner> — mark operation failed and investigate before retry.
- [ ] Implement `FundingCommitment`, `FundingDeposit`, deposit event uniqueness `(network, chainTxHash, eventIndex)` and independent contract/asset/amount/account/finality validation.
  - Done when: client-supplied fake transaction hashes cannot create deposits and confirmed deposits alone affect available balance.
  - Failure: FAILED — <UTC timestamp> — unverified or duplicate deposit recorded — balance misstatement — <owner> — reverse projection, preserve audit evidence and repair watcher.
- [ ] Implement `FinanceJournalEntry` and projections for `Announced`, `Committed`, `Deposited`, `Reserved`, `Disbursed`, `Refunded`, available and pending amounts by asset.
  - Done when: journal reconciliation derives every displayed financial total from immutable entries and confirmed chain events.
  - Failure: FAILED — <UTC timestamp> — journal/projection mismatch — accounting inconsistency — <owner> — stop affected display and reconcile ledger.
- [ ] Implement finality/reorg-aware chain watcher and scheduled reconciliation of logs plus contract state.
  - Done when: reorg, RPC timeout and unknown transaction simulations resolve through inspection rather than duplicate submission.
  - Failure: FAILED — <UTC timestamp> — watcher cannot resolve `Unknown` state — reconciliation gap — <owner> — escalate to manual reconciliation and repair worker.
- [ ] Implement `Disbursement` and `Refund` persistence with unique operation IDs, confirmed transaction state and explorer references.
  - Done when: payout/refund is displayed as pending/failed/confirmed correctly and paid exactly once.
  - Failure: FAILED — <UTC timestamp> — duplicate or falsely confirmed transfer — funds safety incident — <owner> — halt releases, reconcile on-chain state and notify stakeholders.

## Phase 8 — Milestones, private evidence and release workflow

- [ ] Implement `Milestone` with sequence, acceptance criteria, base-unit amount, due date, reviewer, status and on-chain milestone ID.
  - Done when: milestone allocations cannot exceed agreement amount and sequence/authority is validated.
  - Failure: FAILED — <UTC timestamp> — milestone schedule invalid — contract/payment mismatch risk — <owner> — reject agreement version and repair allocation.
- [ ] Implement `EvidenceSubmission` versioning and `EvidenceAsset` metadata: storage key, checksum, MIME type, visibility and scan status.
  - Done when: evidence is private by default, content type/size/checksum are enforced and every replacement is versioned.
  - Failure: FAILED — <UTC timestamp> — evidence is public, unscanned or overwritten — privacy/malware/audit risk — <owner> — quarantine asset, revoke URLs and repair workflow.
- [ ] Implement signed upload flow, malware scan/quarantine job, failure notification and reviewer access controls.
  - Done when: only scan-passed assets can be submitted for review; upload URLs are scoped and short-lived.
  - Failure: FAILED — <UTC timestamp> — unsafe asset reaches reviewer or URL scope leaks — security incident — <owner> — quarantine, revoke and audit downloads.
- [ ] Implement `MilestoneReview` with authorized reviewer, current evidence version, verdict, notes, evidence hash and decision timestamp.
  - Done when: decision supports `Approved`, `Rejected`, `ChangesRequested`; reviewer assignment and chain authority are verified.
  - Failure: FAILED — <UTC timestamp> — unauthorized/stale review accepted — release authorization risk — <owner> — invalidate review and repair policy.
- [ ] Implement milestone state machine: `Pending`, `Ready`, `Submitted`, `UnderReview`, `Approved`, `ReleasePending`, `Paid`, `ChangesRequested`, `Resubmitted`, `Rejected`, `Disputed`.
  - Done when: `Approved` remains distinct from `Paid` and dispute transitions use only pre-authorized remedies.
  - Failure: FAILED — <UTC timestamp> — status conflation or illegal transition — inaccurate payout state — <owner> — correct state machine/projection.
- [ ] Implement chain approval and release orchestration that verifies on-chain approval/balance constraints before requesting payout.
  - Done when: release before approval fails, release after approval is idempotent, and final payout is observed before displaying `Paid`.
  - Failure: FAILED — <UTC timestamp> — release bypasses contract condition or duplicate payout occurs — funds safety incident — <owner> — disable release path and reconcile immediately.

## Phase 9 — Disputes, impact, compliance and audit

- [ ] Implement `Dispute` and `DisputeResolution` with scoped agreement/milestone freeze, parties, grounds, arbitrator, status, signed resolution and permitted remedy.
  - Done when: only authorized pre-agreed arbitrators can resolve; already-paid/exhausted/conflicting cases are rejected safely.
  - Failure: FAILED — <UTC timestamp> — dispute freezes/releases unauthorized funds — governance/funds safety incident — <owner> — stop remedy execution and investigate.
- [ ] Implement compliance decisions for country/asset restrictions, KYB/KYC, sanctions/AML dependencies, retention and eligibility gating.
  - Done when: protected actions re-check compliance at submission, award and financial activation without exposing sensitive signals.
  - Failure: FAILED — <UTC timestamp> — prohibited action proceeds or sensitive compliance result leaks — legal/privacy risk — <owner> — suspend action and remediate policy/data access.
- [~] Implement `OutcomeClaim` with metric type, value, evidence, verifier and `SelfReported`, `Reviewed`, `IndependentlyVerified` provenance.
  - Done when: no aggregate completion percentage or unsupported impact inference is generated.
  - Evidence: [PR #34](https://github.com/Abdiel49/backmint-server/pull/34) is merged. Claims retain exact decimal values, evidence key/checksum and distinct provenance; reviews are separate, auditable records and self-review is rejected. HTTP authorization, independent verifier credentials and aggregate reporting controls remain pending.
  - Failure: FAILED — <UTC timestamp> — impact claim presented as verified without evidence — misleading reporting — <owner> — retract projection and correct provenance.
- [ ] Implement immutable `AuditEvent` for privileged operations, sensitive changes, approvals, exports and authorization denials.
  - Done when: audit records include actor/capacity, target, before/after or event payload hash, timestamp and correlation ID.
  - Failure: FAILED — <UTC timestamp> — privileged action lacks audit record — oversight gap — <owner> — restrict feature and repair audit emission.
- [ ] Implement data retention, deletion/anonymization and export workflows consistent with legal obligations and chain immutability boundaries.
  - Done when: private off-chain data can be handled by policy while required chain/journal references remain legally traceable.
  - Failure: FAILED — <UTC timestamp> — retention/deletion request handled contrary to policy — privacy/legal risk — <owner> — pause automation and escalate to compliance owner.

## Phase 10 — Notifications, embeds, public profiles and analytics

- [~] Implement notification preferences, inbox persistence, queue-based processing/retries, deduplication and failure monitoring. Email delivery remains unavailable until a mail provider is configured.
  - Done when: notification events are outbox-driven, idempotent and respect user preferences.
  - Evidence: [PR #32](https://github.com/Abdiel49/backmint-server/pull/32) is merged. Notification inbox/preferences, queue delivery, bounded retries, deduplication and failure states are implemented. Domain event producers and email provider integration remain pending.
  - Failure: FAILED — <UTC timestamp> — notification is lost, duplicated or violates preference — communication/privacy risk — <owner> — replay safely and repair delivery policy.
- [ ] Implement `ExternalEmbed` with source relation, host organization, allowed origins, theme, mode, status and script version.
  - Done when: embeds expose only public projection/card/list/link and send authenticated submission to Backmint origin.
  - Failure: FAILED — <UTC timestamp> — embed leaks private data or accepts submission cross-origin — privacy/security risk — <owner> — disable embed and repair origin/projection policy.
- [ ] Implement public organization/project/call profiles, unlisted link access and disclosure policy.
  - Done when: public reads never expose private applications, reviews, evidence or internal finance records.
  - Failure: FAILED — <UTC timestamp> — confidential data appears in a public projection — privacy incident — <owner> — revoke cache/embed and remediate access control.
- [ ] Implement financial dashboards by asset and source timestamp, separating announced, committed, deposited, reserved, disbursed and refunded values.
  - Done when: dashboard totals reconcile to finance journal and confirmed chain state.
  - Failure: FAILED — <UTC timestamp> — dashboard conflates financial statuses — reporting/accounting error — <owner> — disable incorrect metric and reconcile.
- [ ] Implement operational and impact dashboards with privacy aggregation thresholds.
  - Done when: metrics include published/active sources, eligibility, awards, agreements, deposits, milestones, disputes and duration without exposing individual confidential performance.
  - Failure: FAILED — <UTC timestamp> — metric reveals confidential data or unsupported impact — privacy/reporting risk — <owner> — suppress metric and correct aggregation.

## Phase 11 — API, contract and integration discipline

- [ ] Version public APIs and generate/version a TypeScript client from OpenAPI without requiring a shared repository.
  - Done when: client generation and OpenAPI snapshots run in CI and breaking changes are explicitly versioned.
  - Failure: FAILED — <UTC timestamp> — client/API contract drift — integration breakage — <owner> — restore compatible contract or publish versioned change.
- [~] Apply idempotency keys to all monetary initiations and mutable decisions, with request hash and result replay behavior.
  - Done when: retrying the same key returns the original result; conflicting payload under same key is rejected.
  - Failure: FAILED — <UTC timestamp> — idempotency key permits duplicate/conflicting effect — financial/governance risk — <owner> — disable endpoint and repair key store.
- [ ] Define versioned cross-repository artifacts for IDs, statuses, asset units, contract ABI, network and events shared with `backmint-app` and `backmint-contracts`.
  - Done when: server validates artifact version at integration boundaries and companion specifications are updated with invariant changes.
  - Failure: FAILED — <UTC timestamp> — repository contract mismatch — unsafe client/chain integration — <owner> — block incompatible release and publish aligned artifact.
- [ ] Enforce server authority boundaries: client is not authoritative for eligibility/balances; contract is authoritative for custody; server is authoritative for process orchestration only.
  - Done when: threat-model tests prove client input and AI output cannot override chain or human authorization.
  - Failure: FAILED — <UTC timestamp> — authority boundary bypass — integrity/funds safety risk — <owner> — disable integration and remediate.

## Phase 12 — Testnet MVP release slice

- [ ] Deliver one funder Organization and one applicant Organization with wallet links and clearly marked demo verification status.
  - Done when: both organizations can act only in their permitted capacity on testnet.
  - Failure: FAILED — <UTC timestamp> — actor roles/verification are ambiguous — MVP trust model invalid — <owner> — repair onboarding/policy.
- [ ] Deliver one independent `FundingOffered` Project or Call, eligibility policy, questionnaire and applicant Application.
  - Done when: eligible organization can submit and mismatched organization type is rejected.
  - Failure: FAILED — <UTC timestamp> — eligibility path does not enforce source policy — MVP acceptance story fails — <owner> — fix rule evaluation.
- [ ] Deliver human selection, one Award, one Agreement with one or two Milestones and exact-party acceptance.
  - Done when: changed agreement term invalidates previous acceptance and no award implies payment.
  - Failure: FAILED — <UTC timestamp> — stale agreement acceptance remains valid — legal/financial workflow failure — <owner> — invalidate acceptance and repair version check.
- [ ] Deliver NEAR testnet escrow deposit, independent verification, evidence upload, authorized milestone approval, payout and transaction history.
  - Done when: fake client transaction is rejected; payout happens exactly once; UI/API distinguish pending, approved and paid.
  - Failure: FAILED — <UTC timestamp> — deposit/payout verification fails — funds lifecycle unsafe — <owner> — stop release and reconcile testnet state.
- [ ] Deliver public embed card with privacy-safe status and CTA.
  - Done when: embed cannot retrieve private evidence/reviews and directs authenticated submission to Backmint.
  - Failure: FAILED — <UTC timestamp> — embed exposes confidential material — privacy failure — <owner> — disable embed and repair projection.

## Phase 13 — V1 scope

- [ ] Deliver Projects and Calls in both funding directions, including multi-award allocation and FundingOffers.
  - Done when: all direction-specific flows and concurrent reservation constraints pass integration tests.
  - Failure: FAILED — <UTC timestamp> — direction/allocation behavior is inconsistent — V1 funding workflow incomplete — <owner> — repair aggregate and transaction logic.
- [ ] Deliver dynamic forms, permissioned reviewers, AI assistance with citations, immutable versions and organization verification.
  - Done when: forms/versioning, reviewer policies and AI safety/provenance tests pass.
  - Failure: FAILED — <UTC timestamp> — dynamic content bypasses validation/authorization — governance risk — <owner> — disable affected workflow and fix validation.
- [ ] Deliver dispute process, project-funder matching, public profiles and reporting.
  - Done when: each feature satisfies its authorization, privacy, audit and reconciliation criteria above.
  - Failure: FAILED — <UTC timestamp> — feature lacks required safety invariant — V1 release blocker — <owner> — resolve missing invariant before release.

## Phase 14 — V2 scope

- [ ] Deliver multiple funding sources with source-aware commitments, deposits, allocation and reconciliation.
  - Done when: per-source and aggregate balances reconcile without double counting.
  - Failure: FAILED — <UTC timestamp> — multi-source allocation mismatches journal — accounting risk — <owner> — suspend aggregation and reconcile.
- [ ] Deliver regional compliance policy engine, regulated fiat on/off-ramp integration and required legal/custody controls.
  - Done when: jurisdiction policy is versioned, auditable and externally reviewed before regulated launch.
  - Failure: FAILED — <UTC timestamp> — regulated flow lacks approved policy/control — legal release blocker — <owner> — disable regional flow and obtain review.
- [ ] Deliver white-label embeds, multilingual organizations, audited arbitration, grants/education templates, cross-chain settlement and enterprise analytics.
  - Done when: each extension preserves authorization, privacy, provenance, financial and audit invariants.
  - Failure: FAILED — <UTC timestamp> — extension violates core invariant — platform integrity risk — <owner> — isolate/disable extension and remediate.

## Acceptance-test matrix

- [ ] F01 Organization onboarding: create organization, membership, representative and verification lifecycle; test duplicate, revoked and sanctions-denied paths.
  - Done when: F01 happy path and all listed errors pass e2e/security tests.
  - Failure: FAILED — <UTC timestamp> — F01 acceptance scenario failed — onboarding release blocker — <owner> — attach failing test/log and repair.
- [ ] F02 FundingOffered publication: independent Project/Call, audience, budget, milestones, publish version and independent intake/visibility controls.
  - Done when: F02 validation errors and publication version rules pass e2e tests.
  - Failure: FAILED — <UTC timestamp> — F02 acceptance scenario failed — publication release blocker — <owner> — attach failing test/log and repair.
- [ ] F03 Executor Application: eligible submission, snapshot, receipt, withdrawal/amendment and all eligibility/file error cases.
  - Done when: F03 rejects closed, unauthorized, duplicate and incomplete submissions.
  - Failure: FAILED — <UTC timestamp> — F03 acceptance scenario failed — application release blocker — <owner> — attach failing test/log and repair.
- [ ] F04 FundingRequested and FundingOffers: standalone source, offer review, hard cap and Agreement conversion without direct-contribution bypass.
  - Done when: F04 direction and all listed amount/asset/signatory error cases pass.
  - Failure: FAILED — <UTC timestamp> — F04 acceptance scenario failed — funding-offer release blocker — <owner> — attach failing test/log and repair.
- [ ] F05 Human evaluation with AI: assignment/conflict, deterministic eligibility, cited advisory review, human decision and atomic reservation.
  - Done when: AI cannot select/authorize and concurrent third approval beyond cap fails.
  - Failure: FAILED — <UTC timestamp> — F05 acceptance scenario failed — governance release blocker — <owner> — attach failing test/log and repair.
- [ ] F06 Award to Agreement: exact terms hash, authorized same-version signatures, chain registration and funding wait state.
  - Done when: stale signer/network/asset/milestone/chain failures are tested.
  - Failure: FAILED — <UTC timestamp> — F06 acceptance scenario failed — agreement release blocker — <owner> — attach failing test/log and repair.
- [ ] F07 Deposit, evidence and release: finality validation, private scanned evidence, human review, on-chain approval, idempotent release and reconciliation.
  - Done when: fake tx, late/failed scan, revoked reviewer, insufficient escrow, double release and pending/failed transfer tests pass.
  - Failure: FAILED — <UTC timestamp> — F07 acceptance scenario failed — financial release blocker — <owner> — attach failing test/log and repair.
- [ ] F08 Cancellation, disputes and refunds: scoped freeze, authorized arbitration, signed resolution and final movement recording.
  - Done when: unauthorized/paid/exhausted/conflicting remedy tests pass.
  - Failure: FAILED — <UTC timestamp> — F08 acceptance scenario failed — dispute release blocker — <owner> — attach failing test/log and repair.
- [ ] F09 Public profiles and embeds: visibility-safe public projection, origin allowlist, rate limits, localization/accessibility and CTA behavior.
  - Done when: private reviews/evidence cannot be fetched through public/embed routes.
  - Failure: FAILED — <UTC timestamp> — F09 acceptance scenario failed — privacy release blocker — <owner> — attach failing test/log and repair.
- [ ] F10 Metrics and impact: financial status separation, operational metrics, provenance labels and privacy thresholds.
  - Done when: dashboards reconcile to source facts and never infer impact from money alone.
  - Failure: FAILED — <UTC timestamp> — F10 acceptance scenario failed — reporting release blocker — <owner> — attach failing test/log and repair.

## Release gates

- [ ] Unit tests cover domain invariants, state transitions, amount arithmetic and authorization policies.
  - Done when: required coverage thresholds and mutation/property tests for critical financial invariants pass.
  - Failure: FAILED — <UTC timestamp> — invariant test failure — release blocked — <owner> — repair implementation or test evidence.
- [ ] PostgreSQL integration tests cover unique constraints, migrations, locks, transactions, outbox and concurrent award/reservation flows.
  - Done when: tests run against a clean disposable database in CI.
  - Failure: FAILED — <UTC timestamp> — persistence integration failure — release blocked — <owner> — repair migration/transaction logic.
- [ ] Security tests cover organization isolation, representative authority, public/private projection, uploads, idempotency and prompt-injection boundaries.
  - Done when: unauthorized actor matrix is tested for every protected resource family.
  - Failure: FAILED — <UTC timestamp> — security test failure — release blocked — <owner> — disable vulnerable path and remediate.
- [ ] NEAR sandbox/testnet e2e tests cover agreement setup, deposit, finality, approval, payout, failure, retry and reconciliation.
  - Done when: acceptance stories 6–10 run against versioned contract artifacts and report transaction evidence.
  - Failure: FAILED — <UTC timestamp> — chain e2e failure — financial release blocked — <owner> — preserve operation IDs/logs and reconcile before retry.
- [ ] OpenAPI/client snapshot tests, dependency/security scanning, observability dashboards/alarms and incident runbooks are complete.
  - Done when: CI and release review attach all results, error/latency alarms are exercised, and rollback/reconciliation steps are documented.
  - Failure: FAILED — <UTC timestamp> — operational release gate missing — release blocked — <owner> — complete evidence/runbook before deployment.

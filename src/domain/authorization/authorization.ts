export const OrganizationRole = {
  Owner: 'Owner',
  Admin: 'Admin',
  ProjectManager: 'ProjectManager',
  Evaluator: 'Evaluator',
  FinanceApprover: 'FinanceApprover',
  Representative: 'Representative',
  Observer: 'Observer',
} as const;

export type OrganizationRole =
  (typeof OrganizationRole)[keyof typeof OrganizationRole];

export type AuthorizationAction =
  | 'organization.manage'
  | 'publication.manage'
  | 'evaluation.submit'
  | 'finance.approve'
  | 'agreement.accept'
  | 'resource.read';

export type MembershipContext = {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: 'Active' | 'Invited' | 'Suspended' | 'Revoked';
};

export type RepresentativeAuthority = {
  organizationId: string;
  userId: string;
  verifiedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
};

export type ExplicitGrant = {
  organizationId: string;
  userId: string;
  action: AuthorizationAction;
  resourceType?: string;
  resourceId?: string;
  expiresAt?: Date;
  revokedAt?: Date;
};

export type AuthorizationRequest = {
  userId: string;
  action: AuthorizationAction;
  actingOrganizationId?: string;
  membership?: MembershipContext;
  representativeAuthority?: RepresentativeAuthority;
  resourceType?: string;
  resourceId?: string;
  resourceOwnerUserId?: string;
  resourceOwnerOrganizationId?: string;
  grants?: readonly ExplicitGrant[];
  now?: Date;
};

export type AuthorizationDecision = {
  allowed: boolean;
  reason:
    | 'ExplicitGrant'
    | 'ResourceOwner'
    | 'OrganizationRole'
    | 'RepresentativeAuthority'
    | 'MissingActingOrganization'
    | 'MembershipMismatch'
    | 'InactiveMembership'
    | 'InsufficientRole'
    | 'RepresentativeAuthorityRequired'
    | 'NoApplicablePolicy';
  actingOrganizationId?: string;
};

const rolePolicies: Partial<
  Record<AuthorizationAction, readonly OrganizationRole[]>
> = {
  'organization.manage': [OrganizationRole.Owner, OrganizationRole.Admin],
  'publication.manage': [
    OrganizationRole.Owner,
    OrganizationRole.Admin,
    OrganizationRole.ProjectManager,
  ],
  'evaluation.submit': [
    OrganizationRole.Owner,
    OrganizationRole.Admin,
    OrganizationRole.Evaluator,
  ],
  'finance.approve': [
    OrganizationRole.Owner,
    OrganizationRole.FinanceApprover,
  ],
  'resource.read': [
    OrganizationRole.Owner,
    OrganizationRole.Admin,
    OrganizationRole.ProjectManager,
    OrganizationRole.Evaluator,
    OrganizationRole.FinanceApprover,
    OrganizationRole.Representative,
    OrganizationRole.Observer,
  ],
};

function active(date: Date | undefined, now: Date): boolean {
  return date === undefined || date.getTime() > now.getTime();
}

function grantApplies(
  grant: ExplicitGrant,
  request: AuthorizationRequest,
  now: Date,
): boolean {
  return (
    grant.userId === request.userId &&
    grant.organizationId === request.actingOrganizationId &&
    grant.action === request.action &&
    (grant.resourceType === undefined ||
      grant.resourceType === request.resourceType) &&
    (grant.resourceId === undefined || grant.resourceId === request.resourceId) &&
    active(grant.expiresAt, now) &&
    grant.revokedAt === undefined
  );
}

export function authorize(
  request: AuthorizationRequest,
): AuthorizationDecision {
  const now = request.now ?? new Date();
  const actingOrganizationId = request.actingOrganizationId;

  if (
    actingOrganizationId &&
    request.grants?.some((grant) => grantApplies(grant, request, now))
  ) {
    return { allowed: true, reason: 'ExplicitGrant', actingOrganizationId };
  }

  if (
    request.resourceOwnerUserId === request.userId &&
    request.action === 'resource.read'
  ) {
    return { allowed: true, reason: 'ResourceOwner', actingOrganizationId };
  }

  if (!actingOrganizationId) {
    return { allowed: false, reason: 'MissingActingOrganization' };
  }

  const membership = request.membership;
  if (
    !membership ||
    membership.organizationId !== actingOrganizationId ||
    membership.userId !== request.userId
  ) {
    return {
      allowed: false,
      reason: 'MembershipMismatch',
      actingOrganizationId,
    };
  }

  if (membership.status !== 'Active') {
    return {
      allowed: false,
      reason: 'InactiveMembership',
      actingOrganizationId,
    };
  }

  if (
    request.action === 'agreement.accept' &&
    request.representativeAuthority
  ) {
    const authority = request.representativeAuthority;
    if (
      authority.organizationId === actingOrganizationId &&
      authority.userId === request.userId &&
      authority.verifiedAt.getTime() <= now.getTime() &&
      authority.revokedAt === undefined &&
      active(authority.expiresAt, now)
    ) {
      return {
        allowed: true,
        reason: 'RepresentativeAuthority',
        actingOrganizationId,
      };
    }
  }

  if (request.action === 'agreement.accept') {
    return {
      allowed: false,
      reason: 'RepresentativeAuthorityRequired',
      actingOrganizationId,
    };
  }

  if (
    request.resourceOwnerOrganizationId === actingOrganizationId &&
    request.action === 'resource.read'
  ) {
    return { allowed: true, reason: 'ResourceOwner', actingOrganizationId };
  }

  const allowedRoles = rolePolicies[request.action];
  if (!allowedRoles) {
    return { allowed: false, reason: 'NoApplicablePolicy', actingOrganizationId };
  }

  return allowedRoles.includes(membership.role)
    ? { allowed: true, reason: 'OrganizationRole', actingOrganizationId }
    : { allowed: false, reason: 'InsufficientRole', actingOrganizationId };
}

import {
  authorize,
  OrganizationRole,
  type AuthorizationRequest,
} from './authorization.js';

describe('organizational authorization', () => {
  const now = new Date('2026-11-14T00:00:00.000Z');
  const base: AuthorizationRequest = {
    userId: 'user-1',
    action: 'publication.manage',
    actingOrganizationId: 'org-1',
    membership: {
      userId: 'user-1',
      organizationId: 'org-1',
      role: OrganizationRole.ProjectManager,
      status: 'Active',
    },
    now,
  };

  it('evaluates permissions in the explicitly selected organization capacity', () => {
    expect(authorize(base)).toMatchObject({
      allowed: true,
      reason: 'OrganizationRole',
      actingOrganizationId: 'org-1',
    });
    expect(
      authorize({
        ...base,
        actingOrganizationId: 'org-2',
      }),
    ).toMatchObject({ allowed: false, reason: 'MembershipMismatch' });
  });

  it.each(['Invited', 'Suspended', 'Revoked'] as const)(
    'rejects %s membership',
    (status) => {
      expect(
        authorize({
          ...base,
          membership: { ...base.membership!, status },
        }),
      ).toMatchObject({ allowed: false, reason: 'InactiveMembership' });
    },
  );

  it('requires current representative authority for legal acceptance', () => {
    expect(authorize({ ...base, action: 'agreement.accept' })).toMatchObject({
      allowed: false,
      reason: 'RepresentativeAuthorityRequired',
    });

    expect(
      authorize({
        ...base,
        action: 'agreement.accept',
        representativeAuthority: {
          organizationId: 'org-1',
          userId: 'user-1',
          verifiedAt: new Date('2026-11-01T00:00:00.000Z'),
          expiresAt: new Date('2026-12-01T00:00:00.000Z'),
        },
      }),
    ).toMatchObject({ allowed: true, reason: 'RepresentativeAuthority' });
  });

  it('rejects expired or revoked representative authority', () => {
    expect(
      authorize({
        ...base,
        action: 'agreement.accept',
        representativeAuthority: {
          organizationId: 'org-1',
          userId: 'user-1',
          verifiedAt: new Date('2026-11-01T00:00:00.000Z'),
          expiresAt: new Date('2026-11-13T00:00:00.000Z'),
        },
      }),
    ).toMatchObject({
      allowed: false,
      reason: 'RepresentativeAuthorityRequired',
    });
  });

  it('honors scoped, unexpired, non-revoked explicit grants', () => {
    const grant = {
      organizationId: 'org-1',
      userId: 'user-1',
      action: 'finance.approve' as const,
      resourceType: 'Agreement',
      resourceId: 'agreement-1',
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    };
    const scopedRequest: AuthorizationRequest = {
      ...base,
      action: 'finance.approve',
      resourceType: 'Agreement',
      resourceId: 'agreement-1',
      grants: [grant],
    };

    expect(authorize(scopedRequest)).toMatchObject({
      allowed: true,
      reason: 'ExplicitGrant',
    });
    expect(
      authorize({ ...scopedRequest, resourceId: 'agreement-2' }),
    ).toMatchObject({ allowed: false, reason: 'InsufficientRole' });
    expect(
      authorize({
        ...scopedRequest,
        grants: [{ ...grant, revokedAt: new Date('2026-11-13T00:00:00.000Z') }],
      }),
    ).toMatchObject({ allowed: false, reason: 'InsufficientRole' });
  });

  it('requires acting capacity except for an individual owner reading their own resource', () => {
    expect(
      authorize({ userId: 'user-1', action: 'publication.manage' }),
    ).toMatchObject({ allowed: false, reason: 'MissingActingOrganization' });
    expect(
      authorize({
        userId: 'user-1',
        action: 'resource.read',
        resourceOwnerUserId: 'user-1',
      }),
    ).toMatchObject({ allowed: true, reason: 'ResourceOwner' });
  });

  it('denies unrelated owners and organization roles outside their policy', () => {
    expect(
      authorize({
        userId: 'user-2',
        action: 'resource.read',
        actingOrganizationId: 'org-1',
        resourceOwnerUserId: 'user-1',
      }),
    ).toMatchObject({ allowed: false, reason: 'MembershipMismatch' });
    expect(
      authorize({
        ...base,
        action: 'finance.approve',
        membership: {
          ...base.membership!,
          role: OrganizationRole.ProjectManager,
        },
      }),
    ).toMatchObject({ allowed: false, reason: 'InsufficientRole' });
  });
});

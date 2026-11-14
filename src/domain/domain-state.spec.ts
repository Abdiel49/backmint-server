import {
  DomainState,
  DomainWorkflow,
  InvalidDomainTransitionError,
  domainTransitions,
  transitionDomainState,
} from './domain-state.js';

describe('domain state transitions', () => {
  const context = {
    actorId: 'user-123',
    correlationId: 'request-456',
    occurredAt: new Date('2026-11-14T00:00:00.000Z'),
  };

  it.each([
    [DomainWorkflow.Agreement, DomainState.Draft, DomainState.Active],
    [DomainWorkflow.Milestone, DomainState.Approved, DomainState.Paid],
    [DomainWorkflow.FinanceOperation, DomainState.Prepared, DomainState.Confirmed],
    [DomainWorkflow.Verification, DomainState.Revoked, DomainState.Verified],
    [DomainWorkflow.Application, DomainState.Submitted, DomainState.Awarded],
  ] as const)(
    'rejects illegal %s transition %s -> %s',
    (workflow, fromState, toState) => {
      expect(() =>
        transitionDomainState(workflow, fromState, toState, context),
      ).toThrow(InvalidDomainTransitionError);
    },
  );

  it('returns an auditable event for a valid transition', () => {
    expect(
      transitionDomainState(
        DomainWorkflow.Agreement,
        DomainState.Accepted,
        DomainState.AwaitingFunding,
        context,
      ),
    ).toEqual({
      eventName: 'DomainStateTransitioned',
      workflow: DomainWorkflow.Agreement,
      fromState: DomainState.Accepted,
      toState: DomainState.AwaitingFunding,
      ...context,
    });
  });

  it('requires actor and correlation identifiers', () => {
    expect(() =>
      transitionDomainState(
        DomainWorkflow.Publication,
        DomainState.Draft,
        DomainState.Published,
        { actorId: '', correlationId: '' },
      ),
    ).toThrow(TypeError);
  });

  it('keeps approval distinct from payment and declarations exhaustive', () => {
    expect(
      domainTransitions[DomainWorkflow.Milestone][DomainState.Approved],
    ).not.toContain(DomainState.Paid);
    expect(Object.keys(domainTransitions)).toHaveLength(8);
  });
});

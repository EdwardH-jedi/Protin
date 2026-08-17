# SportsGang engineering lifecycle and pull-request workflow

The repository owner remains accountable for product direction, Issue scope, acceptance criteria, significant architecture choices, conflicting AI recommendations, merge decisions, and release decisions. AI tools provide engineering leverage; they do not own product decisions.

## Lifecycle

```text
Product or engineering problem
  -> GitHub Issue with scope and acceptance criteria
  -> design review or ADR when the decision warrants it
  -> focused branch
  -> implementation and local verification
  -> pull request and CI
  -> Claude review
  -> blocking findings resolved
  -> Codex independent review
  -> human merge decision
  -> staging verification when deployable
  -> Issue closed
```

## Before implementation

- Confirm the Issue states the problem, scope, non-goals, and observable acceptance criteria.
- Identify API, data, migration, mobile, security, and rollback implications.
- Use an ADR only when the decision meets `docs/adr/README.md`.
- Create one Issue-linked branch using `BRANCH_STRATEGY.md`.

For cross-boundary work, establish the API and shared contract before parallel API and mobile implementation. Parallel work is appropriate only when ownership boundaries are clear.

## Pull-request scope

A pull request should solve one Issue or one tightly related concern, remain reviewable, preserve compatibility unless the Issue changes it, and include tests for changed behaviour. Use the Non-goals section to make deliberately skipped work visible.

If implementation reveals an unrelated systemic problem, open or recommend a follow-up Issue. Do not silently expand the current pull request.

## Review sequence

1. Open the pull request using `.github/pull_request_template.md`.
2. Let CI run and record any environment-limited or unrelated failures accurately.
3. Claude reviews implementation correctness, repository conventions, Issue scope, tests, naming, maintainability, integration, and product-scope drift.
4. Resolve blocking findings or record the owner's explicit justification for rejecting a finding.
5. Codex independently derives expected behaviour from the linked Issue and attempts to falsify the implementation. See `CODE_REVIEW.md`.
6. The owner decides whether the evidence is sufficient to merge.
7. Verify deployable behaviour on staging and then close the Issue.

Do not require repeated full reviews for trivial follow-up commits. Re-review when a follow-up materially changes reviewed behaviour, contracts, data, security, or risk.

## Definition of Done

For normal product work, Done means that all applicable statements are true:

- the Issue has clear acceptance criteria;
- implementation matches the agreed scope and non-goals;
- tests cover changed behaviour;
- lint, typecheck, and relevant local checks pass;
- CI passes, or an unrelated failure is explicitly documented and owned;
- API/mobile contract impact is handled;
- migration and recovery impact is handled where applicable;
- blocking review findings are resolved or explicitly decided by the owner;
- the pull request explains risk, verification, and rollback; and
- staging verification is complete when the behaviour is deployable.

Not every item applies to every change. Mark non-applicable items with a short reason instead of manufacturing evidence.

## Emergency exception

When staging is actively broken, a focused `fix/` pull request may use an abbreviated review. Run the fastest relevant automated checks and a Claude review, record any skipped Codex or staging step, and make the owner accepting the risk explicit. The exception does not authorize a direct push to `main`.

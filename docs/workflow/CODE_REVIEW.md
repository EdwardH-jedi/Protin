# Protin review responsibilities

Reviews are evidence-based checks against the linked Issue, not ceremonial approvals. The pull-request thread is the record for findings, decisions, and intentionally deferred work.

## Claude implementation review

Claude is the normal implementation agent and first review layer. Its review focuses on:

- implementation correctness;
- repository conventions and ownership boundaries;
- Issue scope and acceptance criteria;
- missing or weak tests;
- naming and maintainability;
- API, shared-types, and mobile integration; and
- product-scope or architecture drift.

Blocking findings must be fixed or explicitly rejected by the repository owner with a reason. Re-run the review only when follow-up changes materially affect reviewed behaviour.

## Codex independent review

Codex is the design challenger, adversarial verifier, integration reviewer, and workflow reviewer. It does not normally implement Protin features.

Before implementation, Codex may challenge missing acceptance criteria, authorization boundaries, data or migration impact, API compatibility, edge cases, failure modes, rollback risk, and unnecessary architecture. It should prefer simplifying the proposal over expanding it.

After implementation, Codex starts from the linked Issue and derives expected behaviour independently. It must not trust the implementation, pull-request explanation, existing tests, or Claude's earlier review. It attempts to falsify the change, prioritizing:

1. authorization and security boundaries;
2. state-machine invariants and race conditions;
3. API, data, and mobile contract compatibility;
4. destructive or unsafe migrations;
5. silent failure paths;
6. missing regression tests;
7. architecture drift; and
8. unnecessary complexity.

Use this output structure:

```text
BLOCKING
IMPORTANT
ADVISORY
VERIFICATION PERFORMED
FINAL VERDICT
```

Each finding should identify the affected file and line or symbol, explain the concrete failure mode, and distinguish verified evidence from an untested concern. Do not manufacture findings to fill a category.

## Finding handling

- Fix blocking findings on the same branch.
- Explain false positives or intentional non-fixes in the pull request.
- Move unrelated systemic concerns into a separate Issue.
- Do not treat `LGTM`, tool output, or passing tests as a substitute for the owner's merge decision.

# SportsGang branch and commit strategy

All development happens on focused branches. `main` is the integration branch and feeds staging; there is no separate `develop` branch.

```text
Issue -> branch -> pull request -> reviewed main -> staging
```

## Branch naming

Use `{type}/{short-description}` with a short `kebab-case` description.

| Type | Use | Example |
|---|---|---|
| `feature/` | User-facing functionality | `feature/discovery-ranking` |
| `fix/` | Defect correction | `fix/booking-timezone` |
| `refactor/` | Behaviour-preserving restructuring | `refactor/mobile-api-client` |
| `test/` | Test-only work | `test/booking-transitions` |
| `docs/` | Documentation-only work | `docs/release-runbook` |
| `chore/` | Maintenance, dependencies, or repository configuration | `chore/engineering-workflow-baseline` |
| `ci/` | Continuous-integration changes | `ci/migration-verification` |

Use one coherent concern per branch. Do not absorb unrelated fixes discovered during implementation; open a follow-up Issue instead.

Historical `wave/` branches grouped broad AI-assisted batches. They are not part of the normal workflow because they obscure Issue scope and increase review risk. Preserve existing historical branches, but use an Issue-linked branch from the table above for new work. A coordinated release plan may group several Issues without combining them into one branch.

## Start a branch

Start from a clean, current `main` without discarding unrelated local work:

```bash
git checkout main
git pull --ff-only
git checkout -b feature/my-change
```

If `main` advances substantially, fetch and rebase the feature branch before review. Never force-push shared work without explicit coordination.

## Conventional Commits

Every new commit uses:

```text
<type>(<scope>): <imperative description>
```

Common types are `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf`, and `build`. Recommended scopes include `api`, `mobile`, `db`, `auth`, `booking`, `discovery`, `notifications`, `infra`, `workflow`, and `repo`.

Examples:

```text
feat(api): add booking cancellation policy
fix(mobile): preserve discovery pagination state
test(api): cover blocked discovery candidates
docs(workflow): define ADR policy
chore(repo): add engineering templates
ci(api): add migration verification
```

Commits should describe one coherent engineering change. Avoid vague subjects such as `updates`, `fix stuff`, `final`, or tool-centric descriptions such as `claude changes`. Existing historical commits are not rewritten.

## Merge policy

- Never commit directly to `main`.
- Merge only through a pull request that follows `PR_WORKFLOW.md`.
- Prefer squash merge when intermediate commits do not add lasting value; preserve a clean meaningful series when they do.
- Delete the merged branch when it no longer carries useful work.
- Hotfixes use the same `fix/` branch and pull-request path. If an emergency review step is skipped, record the exception and owner decision in the pull request.

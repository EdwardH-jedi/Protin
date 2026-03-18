# Protin — Claude Code Review

---

## What it is

Claude Code Review is an automated review of a PR's diff. Run it on every PR before merge. It catches issues that tests and type-checks do not: logic errors, ownership violations, spec drift, and naming convention breaks.

---

## How to run it

Use Claude Code in the repository root, referencing the PR branch:

```bash
# From the repo root, on the PR branch
claude review
```

Or, if reviewing a specific diff range:

```bash
claude review --from origin/main --to HEAD
```

Point Claude at the relevant files or changed area if the diff is large and you want a focused review:

```bash
claude review apps/api/routers/bookings.py apps/mobile/src/screens/BookingDetailScreen.tsx
```

Claude will read the diff, compare it against the codebase, and return a list of findings.

---

## What to look for

When reading the review output, prioritise findings in this order:

### Blocking — must fix before merge

- Broken or missing auth checks on new API routes
- Incorrect ownership of a `Match` or `Booking` (user accessing another user's data)
- Type contract violations: field names inconsistent with `docs/contracts/naming.md`
- New database operations without error handling
- Hardcoded credentials or secrets
- `.env` files committed

### Advisory — fix if practical

- Missing null/undefined guards in mobile TypeScript
- API responses not mapped through the camelCase transform layer
- New status values not handled in exhaustive `switch` statements
- Logic that contradicts product scope (e.g., sports outside `'gym'` | `'golf'`)

### Style — optional

- Naming inconsistencies (e.g., `trainer` instead of `partner`)
- Unnecessary abstraction or speculative features
- Verbose code that can be simplified without changing behaviour

---

## Handling findings

For each finding:

1. **Fix it** on the same branch — push to the PR.
2. **Explain a skip** in a PR comment if the finding is a false positive or intentionally out of scope.
3. **Do not silently ignore** blocking findings. If you disagree, raise it with the team before merging.

There is no finding tracker or issue system for code review findings. The PR thread is the record.

---

## Scope limits

Claude Code Review is limited to the files changed in the PR. It does not audit the whole codebase. If a review reveals a systemic issue in files outside the PR, open a separate `fix/` or `chore/` branch to address it — do not expand the current PR's scope.

---

## After review

Once all blocking findings are addressed:
- Request Codex final review (see `PR_WORKFLOW.md`).
- Do not re-run Claude Code Review unless you made substantial additional changes.

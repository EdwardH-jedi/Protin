# Architecture decision records

Architecture decision records (ADRs) capture significant choices that should remain understandable after the implementation context has faded. They are decision records, not design essays or a requirement for ordinary work.

Consider an ADR when a decision:

1. crosses major system boundaries;
2. creates a difficult-to-reverse constraint;
3. changes security or privacy architecture;
4. changes persistence or data compatibility;
5. changes API contract strategy;
6. changes infrastructure architecture; or
7. chooses between credible competing approaches with lasting consequences.

Do not create an ADR for routine features, small refactors, UI changes, trivial dependency updates, or easily reversible implementation details. Those decisions belong in the Issue or pull request.

## Process

1. Copy `0000-template.md` to the next four-digit number.
2. Open the ADR as `Proposed` before or with the implementation pull request.
3. Keep one focused decision in each ADR and link the relevant Issue or pull request.
4. Change the status to `Accepted` when the owner approves it.
5. Never rewrite an accepted decision to hide history. Add a new ADR and mark the earlier record `Superseded` when the decision changes.

Examples that could justify an ADR for Protin include HTTP polling versus WebSocket chat, database versus application-layer discovery ranking, or generated versus hand-maintained API contracts. These examples are not decisions and do not require ADRs now.

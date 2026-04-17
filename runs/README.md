# Claude run archive

Local, per-session log of every Claude Code run in this repo. Generated
automatically by the hooks in `.claude/hooks/`. Not committed — this folder is
gitignored (except for this README).

## Layout

```
runs/
  README.md                                     ← this file (tracked)
  LATEST                                        ← plain-text pointer to newest run
  YYYY-MM-DD/
    HHMMSS_<branch>_<sess8>.md                  ← one file per Claude session
```

- One file per session. Each new prompt inside the same session appends a new
  `## Turn N` block to the same file.
- `runs/LATEST` holds the relative path of the most recently updated run file.
  It is a regular file (no symlinks — Windows-safe).
- Branch names with slashes (`feature/wave-8-…`) are slugged with underscores
  in filenames.

## A run file looks like this

```
# Claude run 2026-04-17T12:45:10+1000 — feature/wave-8-staging-readiness

- Branch: feature/wave-8-staging-readiness
- Commit: abb46bf
- Session: 2b5f9a31-…
- Transcript: C:/Users/.../transcripts/…jsonl

## Turn 1 — 2026-04-17T12:45:10+1000
### Prompt
<your message>

### Recap — 2026-04-17T12:51:44+1000
<Claude's final reply>

### Git — branch `feature/...` @ `abb46bf`
<git diff --stat HEAD>

## Turn 2 — ...
```

## How to use it

Normal Claude Code usage — no flags, no extra commands. The hooks run on
`UserPromptSubmit` and `Stop`, so every prompt and every recap is captured
automatically.

### Review commands

```
# The newest run
cat "$(cat runs/LATEST)"

# All runs from today
ls runs/$(date +%F)/

# A specific past day
ls runs/2026-04-15/

# Full-text search across every run
grep -rn "search term" runs/
```

### Skip logging for one session

```
CLAUDE_SKIP_RUN_LOG=1 claude
```

Both hooks exit 0 immediately and write nothing.

## The hook scripts

- `.claude/hooks/log-run-prompt.sh` — `UserPromptSubmit`: creates the session
  file on the first prompt, appends `## Turn N / ### Prompt` on each prompt.
- `.claude/hooks/log-run-stop.sh` — `Stop`: appends `### Recap` (last assistant
  text) and `### Git` (diff stat) when Claude finishes a turn.

Both are no-ops on missing `jq`, missing `git`, unknown session id, or empty
transcript. Neither can ever block Claude — they always `exit 0` with empty
stdout, and they honor the `stop_hook_active` guard to avoid double-logging
when an earlier Stop hook blocks the turn.

Session → run-file mapping lives under `.claude/tmp/runs/<session>.path`
(gitignored). This is what lets turn 2 of a session find turn 1's file.

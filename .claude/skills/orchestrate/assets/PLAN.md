# PLAN: <title>
run: <slug> · branch: <branch> · base: <sha> · created: <UTC time>

## Requirement (verbatim)
> <the user's words>

## Plain-language summary
<For the requester, no jargon, at most 6 lines: what will change for users; what will not change; what
could go wrong and how we would notice; how to undo it.>

## Goal
<one sentence>

## Examples (confirmed by the requester)
| # | Situation, in the requester's words | Today | After this change |
|---|---|---|---|
| E1 | <e.g. a user opens someone else's invoice link> | <shows the invoice> | <"Access denied" page, nothing leaked> |

## Non-goals
- <what we will not build>

## Acceptance criteria
- AC1: <observable, testable behavior, including the unhappy path> (examples: E1)

## Assumptions
- A1: <assumption> · default: <choice> · asked user: yes/no

## Context map
- `<path>` — <role>
Flow: <request/data flow in at most 10 lines>
Reuse: `<path:line>` — <what it does, how to call it>
Recon notes: .orchestrator/recon/

## Decisions
- D1: <decision> — why: <reason> — rejected: <alternatives and why>

## Global constraints
- Conventions: <naming, error handling, logging, file layout that every task follows>
- Forbidden: new dependencies unless a task lists them; edits outside write-sets; <project-specific>
- Platform and versions: <runtime, framework, DB versions>

## Verify (global)
```bash
# The full check, one command per line: build, typecheck, lint, the whole test suite. Each exits non-zero on failure.
```

## Verify (per task)
```bash
# Fast whole-project checks the gate runs after every task, so a task can't break code outside its write-set:
# e.g. the full typecheck or build, and tests related to changed files. Keep it under about a minute.
```

## Contracts
```text
# exact shared signatures, types, JSON shapes, tables, routes, env vars, error codes
```

## Risks
| R | Scenario | Mitigation | Covering test (task) |
|---|---|---|---|

## Test matrix
| AC or R | Test (file :: name) | Task |
|---|---|---|

## Task DAG
| ID | Title | Deps | Wave | Write-set | Risk | Model | Oracle |
|---|---|---|---|---|---|---|---|

## Release and approval
- Risk tier: <low | med | high>; high-risk paths (orch.sh risk): <list or none>; code-owner approval needed: yes/no
- Release: <feature flag name and default (off for new user-visible behavior), or why none>
- Data: <migrations: expand/contract steps, lock and statement timeouts, backfill plan; or none>

## Rollback
<how to undo safely: revert commits, down-migration, flag off; and what has been checked to work>

---
name: orchestrate
description: >-
  Plan-then-delegate build orchestrator. The main session (Opus at max effort) maps the
  codebase, writes an exhaustive plan with acceptance criteria, examples the requester
  confirms, frozen contracts, edge cases and test cases into .orchestrator/, then dispatches
  cheap orch-executor subagents task by task (parallel only when provably safe), gates every
  result with deterministic checks (scope, frozen spec, tests that must detect the change,
  regressions against a baseline, secrets, risky paths), and keeps a resumable checklist that
  survives usage limits, compaction and tool switches. Use for any feature, refactor,
  migration or bug fix spanning several files or steps; when the user says orchestrate, plan
  and build, execute the plan, or resume; and whenever .orchestrator/STATE.md exists.
argument-hint: "<requirement> | resume | status"
effort: max
allowed-tools: Bash(bash .claude/skills/orchestrate/scripts/orch.sh *)
---

# Orchestrate: the brain plans, cheap hands build, gates decide

You are the orchestrator. You understand, plan, route, and verify; `orch-executor` subagents write the code. Priorities, in order: (1) the user's requirement fully met, with evidence, and nothing else broken; (2) fewest total tokens; (3) wall-clock time. Never buy (2) or (3) with (1).

## Iron rules (re-read after any compaction)

1. **Files are the memory.** `.orchestrator/STATE.md` is the source of truth; keep its NEXT ACTION current. `orch.sh dispatch`, `gate`, `review`, `accept` and `merge` maintain the task lines; you edit STATE only for NEXT ACTION, new task lines, and `[!]` or `[-]`. Never redo a `[x]` task.
2. **Evidence over claims.** A task is done only when `orch.sh gate` marks it `[x]`. Executor reports are hints. The gate reads the brief as last committed: after you change a brief's Write-set, Test cases, Verify, Risk or Oracle, run `orch.sh checkpoint "ruling <ID>"` before gating.
3. **Write each brief once; dispatch by path.** Your output tokens are the priciest in the system. Every task lives in `.orchestrator/tasks/<ID>.md`; the dispatch prompt is the 2 to 4 lines `orch.sh dispatch` prints. Never paste code, diffs, logs, or history into a dispatch.
4. **Name the agent and route the model on every dispatch** (Routing table). An omitted model silently inherits yours. Never fork and never use general-purpose or the built-in Explore for this work: they run on your model, and a fork also copies your whole context.
5. **Parallel writes only when every check in references/parallelism.md passes**; otherwise sequential. Read-only scouts may always run in parallel.
6. **Keep your context lean.** Read an executor's report only if its status is not DONE or the task is high-risk. See command output only through `orch.sh` (full logs stay on disk).
7. **Rule, don't stall.** Mid-run ambiguity: decide, log `Ruling: <decision> — <why> — <cost if wrong>` in LEDGER.md, continue. Stop for the user only for destructive or irreversible actions, security-sensitive choices, a change to what users or data will see that the confirmed Examples don't settle, anything leaving this repo (push, publish, deploy, paid APIs), or a plan so broken that every path is a guess.
8. **Never** push, merge into the default branch, open PRs, or delete branches without the user's explicit go-ahead. The installed hook asks before any push while a run is active.
9. **The requester approves intent, not code.** When `orch.sh risk` says high (auth, money, data, migrations, dependencies, CI, infrastructure), the change needs a code owner's review on its PR. Say so in the plan and the report; "run autonomously" never removes that.

`orch.sh` below means `bash .claude/skills/orchestrate/scripts/orch.sh`, run from the repository root with exactly that relative path (the project's allow rule matches it). Run `orch.sh help` for every command. Each run prints its log path, one line per Verify step, then the tail. For suites slower than 2 minutes, raise the Bash tool timeout (up to 10 minutes); a block stops by itself after `ORCH_TIMEOUT` seconds (default 540).

## Start here

Request: $ARGUMENTS
(If that line shows no request, the request is the user's latest message.)

- `status`: run `orch.sh status`, report it in at most 10 lines, and stop.
- `resume`, or `.orchestrator/STATE.md` exists with a `status:` other than `done` and a `branch:` equal to the current branch: go to **Resume protocol** at the bottom. If `orch.sh status` says FOREIGN RUN, that state belongs to another branch: never resume it.
- Otherwise size the work first. Ceremony has to pay for itself:

| Size | Looks like | Do |
|---|---|---|
| XS | 1 file, about 20 lines, obvious, no risky path | Do it yourself, run the relevant tests, then `orch.sh quick` (exit 1 = secret, exit 3 = high-risk path, so it is not XS: use S). No subagents, no `.orchestrator/`. |
| S | one coherent change | Short recon, PLAN plus 1 brief, 1 executor, gate, Phase 4 (final review only if risky). |
| M | 2 to 10 tasks | Full workflow. |
| L | more than 10 tasks or several subsystems | Split into milestones that each end green and become their own PR; run the full workflow per milestone. |

## Phase 1: Recon (understand before planning)

1. On the default branch? `git switch -c orch/<slug>`. Then `orch.sh init <slug>`. If it warns about uncommitted files, commit the kit's own files; ask the user before touching theirs.
2. Find the real build, typecheck, lint, and test commands (manifests, CI config, README, CLAUDE.md). Write them into PLAN.md: `Verify (global)` gets the full check, one command per line; `Verify (per task)` gets fast whole-project checks the gate runs after every task (the full typecheck or build, tests related to changed files; under about a minute).
3. `orch.sh baseline`. It runs every step even after one fails and records each step's result; failing steps are pre-existing, not ours. Note them in STATE under Baseline.
4. Breadth: dispatch 1 to 3 `orch-scout` in one message, each prompt just `Question: <one question>. OUT=.orchestrator/recon/<topic>.md` plus any CLAUDE.md rule it must obey. Depth: read yourself every file you will plan changes to, plus its callers and tests. Never plan an edit to code you haven't read. If behavior you must keep has no test, plan a characterization-test task first (references/planning.md, section 1).
5. List your assumptions. If any would change the design, ask the user once, all questions batched, each with your recommended default.

Method and scout questions: references/planning.md, section 1.

## Phase 2: Plan (spend your thinking here)

Write PLAN.md (template assets/PLAN.md) and one brief per task (template assets/TASK.md), following references/planning.md: PM lens, Examples, failure pre-mortem, frozen contracts, test matrix, task DAG with waves, write-sets, risk tier, oracle, and model.

**Intent check.** Fill PLAN's `Plain-language summary` and `Examples`: 3 to 8 concrete situations in the requester's own words, including what must not change. Every acceptance criterion cites its examples, and every example becomes a named test case in some brief.

Before asking for approval, check and fix:
- every acceptance criterion and example maps to at least one task and one named test; every risk maps to a test or a logged ruling
- no placeholders ("handle errors", "add tests", "as needed", "etc.", TBD, "similar to T2")
- exact paths, names, signatures, and commands; shared names identical in PLAN contracts and every brief
- each brief stands alone for an engineer with zero context, and has `Risk:`, `Oracle:`, `test:` names, and a Verify block with one command per line that prints test names
- same-wave write-sets are disjoint and hot files are serialized (references/parallelism.md)
- `Release and approval` names the risk tier, any flag, and any data migration plan

High-risk plans (auth, money, data migrations, more than 10 tasks): first dispatch `orch-reviewer` (model opus) with `Mode: plan. OUT=.orchestrator/reports/plan-review.md`, then fix what it finds. Reviewer prompts carry paths only, never your opinion of the work.

Then set STATE `status: awaiting-approval`, run `orch.sh checkpoint "plan <slug>"`, and show the user at most 20 lines: the plain-language summary, the Examples table, tasks by wave, top risks, who must approve, and assumptions. Ask them to confirm or correct the examples. Wait, unless the user said to run autonomously.

## Phase 3: Execute (the loop)

Repeat until no `[ ]` or `[~]` tasks remain:

1. **Pick** the next wave: tasks whose deps are all `[x]`.
2. **Dispatch bookkeeping, one call:** `orch.sh dispatch T03` (a parallel-safe wave: `orch.sh dispatch --worktree T05 T06`). It lints each brief (errors stop it), marks the tasks `[~]`, writes the ledger, checkpoints, and prints BASE, the model, and the exact prompt for each task.
3. **Dispatch** `orch-executor` with the printed model and the printed prompt, verbatim. A wave: at most 3 in one message, each with `isolation: "worktree"` (then follow references/parallelism.md). Don't set a `name` (named spawns can become agent-team teammates).
4. **Wait** for completion; don't poll. While an executor works in the main checkout, make no git writes there.
5. **Gate:** `orch.sh gate T03 --agent <agent ID>` (BASE is found automatically; for a worktree task append its directory).
   - Exit 0: PASS, and the task is marked `[x]`. Worktree task: it prints `orch.sh merge T05 <dir>`; run it.
   - Exit 4: PASS but high risk, every time. Dispatch `orch-reviewer` (sonnet) with the prompt the gate prints, then the `orch.sh review T03` command it prints (worktree tasks add the directory). Only a review that carries the REQUEST token from the gate's latest request counts. APPROVE marks `[x]` (worktree tasks: merge next). Not approved: fix loop with the findings path; after the fix passes the gate (exit 4 again, with a new REQUEST), one `Mode: rereview. Findings: <path> BASE=<HEAD when you sent the fix> REQUEST=<the new token> OUT=.orchestrator/reports/T03-rereview.md`, then `orch.sh review T03`. Anything still open after that: `orch.sh accept T03 "<ruling>"`.
   - Exit 1: FAIL. WARN lines the brief doesn't call for also go to the fix loop.
6. **Fix loop** (at most 3 rounds per task):
   - Rounds 1 and 2: resume the same executor with the failure verbatim (gate output, at most 20 lines, or the findings path). Claude Code: SendMessage to its agent ID. opencode: the subagent tool with its sessionID. Its context is warm and cached. No resume mechanism: treat it as round 3.
   - Round 3: `orch.sh dispatch T03` again (it keeps BASE and adds the attempt and partial-work lines) to a fresh executor one model tier up.
   - Still failing: stop dispatching. Read the log and diff yourself, then fix the brief (plan defect, logged as a ruling, then `orch.sh checkpoint`), split the task, or mark it `[!]` and continue with independent work.
   - ORACLE: the tests pass with the code change reverted, so they don't test it; the executor must assert the new behavior. Only if the task is truly untestable or a pure refactor, change the brief's Oracle (ruling, checkpoint).
   - SPEC-DRIFT, PLAN-DRIFT, BASELINE-DRIFT: if you made the change (a ruling, a new baseline), checkpoint and re-gate. If you didn't, an executor did: restore the file with `git checkout -- <path>`, log it, and run the fix loop.
   - An executor reports a hook denial: never work around it. If the action is legitimately needed (a dependency the plan sanctions, say), do it yourself in the main session, commit it, and resume the executor.
   - NEEDS_CONTEXT: answer precisely by resuming the executor, and copy the answer into the brief's Notes so it survives a resume.
7. **Propagate.** Executor DISCOVERIES that affect later tasks go into those briefs' Notes. A changed contract is a ruling: update PLAN and every dependent brief, checkpoint, and re-check tasks already done.
8. **Batch.** Several tiny same-shape edits across files become one brief and one executor.

## Phase 4: Integrate and prove

1. `orch.sh sync`. If the branch is behind the default branch, `git merge --no-edit origin/<default>` (local only; never push) before the next step. Overlapping files are the likeliest place for semantic conflicts.
2. `orch.sh verify-all`: exit 0 means no regressions against the baseline (pre-existing failures are listed, not counted). Exit 1: one interaction-fix task (references/failure-modes.md, recovery).
3. **Acceptance walk.** For each acceptance criterion and each Example, name the passing test, or the command output, that proves it. No proof means not done: add a task.
4. **Behavior evidence.** When users can see the change (UI, API, CLI) and the project runs locally, run it and exercise every Example: a browser tool or Playwright with screenshots for UI, requests to localhost for an API, the CLI itself. Save evidence under `.orchestrator/reports/evidence/`. Prefer turning these checks into a committed end-to-end test task. If the app can't run locally, say so in the report.
5. `orch.sh slop <run-base>`; real hits go into one fix task (below).
6. **Final review:** `orch-reviewer` with `Mode: final. BASE=<run-base> OUT=.orchestrator/reports/final-review.md`, model opus if the diff exceeds about 400 lines, `orch.sh risk` says high, or any task was high-risk; otherwise sonnet.
7. **One fix task** for all findings: brief `FIX1` whose Context names the findings file(s), whose Write-set lists the files they name, and whose Verify is the global Verify. Dispatch and gate it like any task, then `verify-all`, then one `Mode: rereview. Findings: <files> BASE=<FIX1 base> OUT=.orchestrator/reports/final-rereview.md`, then rule on the residue. There is no second fix wave.

## Phase 5: Close

1. `orch.sh finish`. It refuses while tasks are open (`[-]` with a ruling drops one), marks the run done, keeps a full copy of the run state under `.git/orch/archive/`, removes `.orchestrator/` from the branch in a final commit (so run state never reaches main or a teammate), and writes `PR.md` there.
2. Report to the user in at most 30 lines, plain language first: what changed for users; each Example and acceptance criterion with its evidence; every `Ruling:` with its cost-if-wrong; the risk tier and who must approve; how to undo it; files changed; deferred items. Then ask: push the branch and open a draft PR with the generated description? Recommend squash-merge.
3. If the run uncovered durable facts (commands, conventions, flaky tests, traps), propose a short CLAUDE.md addition to the user. Never edit CLAUDE.md without asking.

## Routing

| Work | Agent | model |
|---|---|---|
| Finding files, usages, conventions, test setup | orch-scout | haiku (sonnet for tangled flows) |
| Brief contains the full code; 1 or 2 files | orch-executor | haiku |
| Implementation from a precise prose brief | orch-executor | sonnet |
| Cross-file integration, subtle logic, round-3 escalation | orch-executor | opus |
| High-risk task review, re-reviews | orch-reviewer | sonnet |
| Plan review; final review of a large or high-risk diff | orch-reviewer | opus |

Cheap models take more turns on multi-step work, and game tests more often, so when unsure use sonnet; the gate's oracle catches tests that don't test anything. Confirm the models actually used with `/tasks`. Harnesses without a per-dispatch model (opencode): pick the agent instead, `orch-executor-lite` (haiku tier), `orch-executor` (sonnet tier), or `orch-executor-deep` (opus tier).

## Resume protocol (after a usage limit, crash, compaction, or tool switch)

1. `orch.sh status` (FOREIGN RUN: the state is another branch's; stop and tell the user); read STATE.md fully; `tail -n 20 .orchestrator/LEDGER.md`; `git log --oneline -15`; `git worktree list`.
2. For each `[~]` task:
   - `gate=PASS` with `review=pending`: run `orch.sh gate <ID>` again (it asks for the review afresh), dispatch the reviewer, then `orch.sh review <ID>`. With `merge=pending` and no pending review: `orch.sh merge <ID> <worktree>`.
   - Otherwise `orch.sh gate <ID>` (worktree tasks: append the worktree directory). Exit 0 or 4: continue at Phase 3 step 5. Anything else: `orch.sh dispatch <ID>` re-dispatches with the partial-work line and the same BASE. A failed worktree attempt: re-run it sequentially in the main checkout (dispatch without `--worktree`), with the Notes line "An earlier attempt is in <worktree path>; read it, do not copy it blindly", then remove that worktree.
3. Continue from NEXT ACTION; set `updated:` to now plus your tool and model.

No subagents in this harness? Do each task yourself, in order, using `.claude/agents/orch-executor.md` as your rules, and still gate every task.

## Files

- `assets/PLAN.md`, `assets/TASK.md`, `assets/STATE.md`: templates (`init` copies PLAN and STATE into `.orchestrator/`). `assets/settings.json` and `assets/POINTER.md`: what the installer merges into the project, including two hooks: `orch.sh hook-pretool` (while a run is active: blocks agents' pushes, installs, deploys, destructive database and file commands, run-state edits and edits outside the write-set; asks before risky main-session commands) and `orch.sh hook-session` (puts NEXT ACTION back in context after compaction or restart).
- `scripts/selftest.sh`: checks `orch.sh` and the hooks on this machine. `scripts/sync-opencode.sh`: regenerates `.opencode/agents/` after you edit `.claude/agents/`.
- `references/planning.md`: recon, PM lens and Examples, pre-mortem, contracts, decomposition, brief writing, test design, release and data safety. Read at Phase 1.
- `references/parallelism.md`: parallel-safety checks, worktree protocol, merge-back. Read before any parallel wave.
- `references/failure-modes.md`: known multi-agent and coding-agent failure modes with the guard for each, what every gate verdict means, and recovery steps. Read when anything goes sideways.
- `references/team.md`: running the kit in a shared repository: risk policy (`.orchestrate-policy`), code owners, CI, hooks and workspace trust, sandboxing. Read before the first run in a team repo.

# Failure modes and guards

## Contents
1. Evidence base
2. Multi-agent failure modes (MAST) and their guards
3. Coding-agent failure modes and their guards
4. Gate verdicts: what each line means and what to do
5. Recovery playbook
6. Sources

## 1. Evidence base

- **MAST** (Cemri et al., UC Berkeley, NeurIPS 2025): 1,642 annotated traces from 7 multi-agent frameworks, failure rates of 41% to 86.7%, 14 failure modes in three groups: system design 44.2%, inter-agent misalignment 32.3%, task verification 23.5%. The most frequent single modes: step repetition 15.7%, reasoning-action mismatch 13.2%, unaware of termination conditions 12.4%, disobeying the task specification 11.8%. Their interventions: clearer role specs and an added high-level objective check improved success, but no single fix was enough.
- **Anthropic** (multi-agent guidance, 2026): multi-agent setups typically use 3 to 10 times the tokens of one agent; split work by context boundary, not by role; verification subagents tend to declare victory after one or two passing tests unless told to run everything. Long-running harnesses: agents marked features complete without end-to-end testing until they were made to test through a browser as a user would.
- **Cognition** (2025 and 2026): actions carry implicit decisions, so parallel writers conflict; multi-agent systems work when writes stay single-threaded and the extra agents contribute intelligence; a clean-context reviewer finds bugs the author cannot see, averaging about two per PR.
- **Superpowers** (obra): controllers that lost their place after compaction re-dispatched whole completed task sequences; dispatch prompts bloated with pasted history; worker-spawned reviewers duplicated the controller's review; per-finding fix agents cost more than all tasks combined.
- **Passing tests are a weak signal.** About 8% of SWE-bench patches that pass the task's own tests fail the full developer suite, and about 11% are wrong (PatchDiff, 2025); METR found 0 of 15 test-passing agent PRs mergeable as-is (2025). Tests an LLM writes while looking at buggy code assert the bug.
- **Models game tests.** On impossible tasks Claude models cheat mainly by editing the tests (ImpossibleBench, 2025); Anthropic's system cards name tests that verify mocks as a common hack, and report higher hack rates for Haiku-class models than for Opus.
- **Prompt rules are not controls.** Replit's agent deleted a production database during an instructed code freeze (2025); other destructive incidents (terraform destroy, deleted home directories, malicious extension prompts) happened outside the source tree, where a diff-based gate sees nothing. Claude Code's auto mode allows pushes to any branch and manifest installs by default; users approve about 93% of permission prompts.
- **Claude Code docs and issue reports**: worktree subagents branch from `origin/<default>` unless `worktree.baseRef` is `head`; a subagent's git commands moved the parent checkout's branch; symlinked dependency folders block worktree cleanup; forks copy the parent's context and model; the built-in Explore inherits the session model; a skill's `allowed-tools` grant lasts one turn; after compaction each skill is re-attached up to its first 5,000 tokens; hooks from project settings run only once the workspace is trusted, and on native Windows they run in Git Bash.

## 2. Multi-agent failure modes (MAST) and their guards

| Mode | Looks like | Guard in this kit |
|---|---|---|
| 1.1 Disobey task spec | builds something adjacent to the ask | brief is the single spec; Examples confirmed by the requester; Done-when list; gate; reviewer spec check |
| 1.2 Disobey role | executor plans, researches, spawns helpers | executor and scout have no Agent, Skill, or web tools (opencode: denied by permissions); the hook denies network, installs and state-changing orch.sh commands for agents |
| 1.3 Step repetition | finished tasks re-run; same files re-read | write-ahead STATE; dispatch refuses `[x]` tasks; resume checks git first |
| 1.4 Loss of history | decisions forgotten after compaction | PLAN, STATE, LEDGER on disk; iron rules at the top of SKILL.md; the SessionStart hook re-injects NEXT ACTION |
| 1.5 Unaware of termination | loops forever, or stops early | Done-when per task; Phase 4 definition of done; `maxTurns`; 3-round fix cap |
| 2.1 Conversation reset | a task restarts from scratch | re-dispatch keeps BASE and says "finish partial work, do not start over" |
| 2.2 Fail to ask | ambiguous requirement guessed | Examples confirmed up front; NEEDS_CONTEXT status; batched questions in Phase 1 |
| 2.3 Task derailment | "improves" adjacent code | Out-of-scope list; surgical rules; hook stops edits outside the write-set; gate scope check |
| 2.4 Information withholding | a discovery never reaches later tasks | DISCOVERIES field in every return; orchestrator copies them into briefs |
| 2.5 Ignoring other agents | findings or rulings dropped | fix loop forwards findings verbatim; rulings live in brief Notes |
| 2.6 Reasoning-action mismatch | "tests pass" when they don't | gate re-runs Verify itself; reports are never proof |
| 3.1 Premature termination | "done" with criteria unmet | acceptance walk with evidence for every AC and Example; behavior evidence on the running app |
| 3.2 No or incomplete verification | only compile or lint checked | task gate with per-task whole-project checks, then verify-all against the baseline, then final review |
| 3.3 Incorrect verification | tests that cannot fail; wrong command | oracle (tests must fail without the change); NO-ASSERT; NO-TESTS; MISSING-TEST; per-step exit codes; RED then GREEN for fixes; reviewer checks test quality |

## 3. Coding-agent failure modes and their guards

| Failure | Guard |
|---|---|
| Parallel agents make conflicting implicit choices | contracts and global constraints frozen in PLAN before fan-out; parallel only with disjoint write-sets |
| Stale worktree base causes silent regressions | `worktree.baseRef: "head"`; checkpoint before dispatch; executor checks BASE ancestry |
| Run branch falls behind a main branch other engineers keep moving | `orch.sh sync` reports how far behind and which files overlap; merge the default branch locally, then verify-all |
| Worktree lacks dependencies, tests can't run | `worktree.symlinkDirectories` and `.worktreeinclude` |
| Two agents in one checkout: `index.lock` errors, `git add -A` sweeping others' files | one executor per checkout; the hook denies `git add -A/-u/.` and `commit -a`; no orchestrator git writes while an executor runs |
| A subagent moves the parent's HEAD | the hook denies checkout, switch, reset, rebase, stash and other state-changing git commands for agents |
| Hot-file collisions (lockfiles, migration numbering, registries, barrel files) | each hot file owned by one task per wave |
| Pre-existing failures blamed on new work, or "fixed" out of scope | per-step baseline with failure fingerprints; verify-all counts only what got worse |
| A failing `lint && test` line hidden by a later passing line | each Verify line is a step whose exit code counts |
| Tests weakened or skipped to get green | executor rules; scope check on test files; slop scan (skips, `.only`, suppressions, `--passWithNoTests`, snapshot updates); reviewer |
| Tests that can't fail (no assertion, wrong filter, mock-only) | oracle (code reverted to BASE, tests must fail); NO-ASSERT; NO-TESTS; MISSING-TEST; reviewer |
| A change breaks a caller outside the write-set | PLAN `Verify (per task)` runs whole-project checks after every task, compared with the baseline |
| Hallucinated APIs or helpers | briefs name exact symbols; executor greps before use, else NEEDS_CONTEXT |
| Hallucinated or malicious packages | executors can't install (hook); manifest changes WARN and make the task high-risk; the orchestrator installs |
| Duplicate helpers, "v2" functions, needless abstractions | recon reuse list; reuse-before-write rule; reviewer slop rubric |
| Secrets or credentials committed | SECRET check on every added line (values never printed); gitleaks when installed; `.orchestrate-policy` `secret-ok` for test certificates |
| Secrets leaking into transcripts | the hook denies agents reading `.env`, dumping the environment, or opening credential files |
| Orchestrator context bloat | dispatch by path; returns of at most 10 lines; logs stay on disk |
| Dispatch prompts stuffed with history | `orch.sh dispatch` prints the 2 to 4 line prompt; all context lives in the brief |
| Worker-spawned reviewers | no Agent tool for executors (opencode: `subagent` denied) |
| Workers silently run on Opus with the orchestrator's context (fork, general-purpose, built-in Explore) | named agent types only, explicit model, check `/tasks` |
| Executor loosens its own Verify block or widens its write-set | the gate reads the brief as committed by orch.sh (SPEC-DRIFT on working-copy edits, TAMPER on committed ones, including fake checkpoint commits); the hook denies agents' edits under `.orchestrator/` |
| Damage outside the repository (deploys, cloud, databases, home directory) | the hook denies agents' infrastructure and cloud CLIs, publishing, destructive database commands, migrations against a remote DATABASE_URL, recursive deletes outside the checkout, network access beyond localhost; asks the main session first. A sandbox (WSL2 or a dev container on Windows) is the real boundary |
| Risk tier understated by the planner | path policy raises it (`orch.sh risk`, `.orchestrate-policy`); high-risk tasks need a review; the report names the code-owner approval |
| Run state reaches main and hijacks teammates' sessions | `orch.sh finish` removes `.orchestrator/` from the branch; state records owner and branch; status, init, hooks and the pointer ignore another branch's run |
| Write-set paths with brackets (`app/[id]/page.tsx`) read as glob patterns | entries match literally first |
| Symlinked `node_modules` in a worktree looks like an uncommitted file | gate ignores untracked symlinks |
| Editable installs or workspace links make worktree tests import the main checkout | parallel-safety check 7 |
| Project hooks block or rewrite bookkeeping commits | checkpoints commit only `.orchestrator/`, with `--no-verify` |
| Permission prompts stall a long run | installer adds an allow rule for `orch.sh`; auto mode covers the rest |
| Test runs leave generated files that fail every gate | `baseline` lists them; ignore them in `.git/info/exclude` |
| A hanging test stalls the run | `ORCH_TIMEOUT` (default 900 s) stops a block and prints TIMEOUT |
| One fix agent per finding | one batch-fix executor per review |
| Wrong model silently used | explicit model on every dispatch; check `/tasks` |
| Subagent inherits max effort and overthinks simple work | `effort` set in each agent file |
| Flaky tests | rerun once; if the result flips, log `flaky:` in LEDGER; never mask with skips or sleeps |
| Usage limit hit mid-task | write-ahead STATE; partial subagent output; resume protocol |

## 4. Gate verdicts: what each line means and what to do

| Line | Meaning | Action |
|---|---|---|
| HISTORY | BASE is no longer an ancestor of HEAD | something rewrote history; inspect `git reflog`; re-dispatch on the current HEAD |
| BRANCH | the checkout is not on the run branch | switch back (you, not the executor); re-gate |
| SPEC-DRIFT | the working copy of the brief differs from the committed one in Risk, Oracle, Write-set, Test cases or Verify | yours: `orch.sh checkpoint "ruling <ID>"` and re-gate; not yours: restore the brief, log it, fix loop |
| PLAN-DRIFT, BASELINE-DRIFT | PLAN's Verify blocks, or the baseline files, have uncommitted changes (the gate uses the committed ones) | yours: checkpoint and re-gate; not yours: restore with `git checkout -- <path>`, log it |
| SCOPE | files changed outside the write-set | needed: add them to the brief (ruling, checkpoint); not needed: the executor reverts them |
| TAMPER | a commit not made by orch.sh changed a brief, PLAN, STATE or the baseline, or a fake checkpoint | revert those commits; log it; fix loop |
| DIRTY | uncommitted product files | resume the executor: "commit your write-set files and REPORT" |
| SECRET | a credential-like value was added | remove it (config or env vars); a deliberate fake value gets an `orch-allow-secret` comment |
| NO-ASSERT | a new test file defines tests but asserts nothing | fix loop |
| NO-TESTS | the runner reported zero tests | the filter or path in Verify matches nothing: fix the brief (ruling) or the test names |
| MISSING-TEST | a `test:` name from the brief never appeared in the output | the test is missing, misnamed, or the runner isn't verbose |
| verify / step N FAIL | the brief's Verify failed at step N | fix loop with the gate output |
| COLLATERAL / REGRESSION | the plan's per-task checks got worse than the baseline | the task broke something outside its files: fix loop; if the fix needs other files, extend the write-set by ruling |
| ORACLE | with the code reverted to BASE, the tests still pass (fail-before; this includes a test-only change) or fail (pass-before) | fix loop: assert the new behavior; characterization tests take pass-before; untestable work takes none, by ruling |
| DIRTY (after Verify) | running the checks changed or created files | a test rewrites product files, or generated output isn't ignored: fix the test, or ignore the output |
| INCOMPLETE | a Verify step ended the shell early, so later steps never ran | remove the `exit` from the block |
| RISK: high | the diff touches risky paths although the brief says otherwise | the task now needs a review (exit 4); keep the higher tier |
| WARN | debris, snapshot changes, dependency manifests, no test changed | send to the fix loop unless the brief calls for it |
| exit 4 | PASS, review required (always, for high risk) | reviewer with the printed prompt, then `orch.sh review <ID>`; only a review carrying that request's REQUEST token counts |

## 5. Recovery playbook

- **STATE disagrees with git:** git wins. Rebuild task lines from `git log --grep "chore(orch)"`, find each BASE with `orch.sh base <ID>`, and re-run the gate.
- **An interrupted gate left files at their BASE version:** any orch.sh command restores them from the record in `.git/orch/oracle`; `orch.sh status` does it explicitly.
- **Merge conflict after a parallel wave:** `orch.sh merge` aborts it; re-run that task sequentially on the new HEAD.
- **verify-all fails although every task passed its gate:** an interaction bug. One executor (sonnet, or opus if subtle) gets the failing output plus the IDs of the tasks involved.
- **A regression appears right after merging the default branch:** check whether it also fails on `origin/<default>`; if so it is upstream's, not ours: note it in the report.
- **Executor keeps hitting maxTurns:** the task is too big or under-specified. Split it, or add the missing context to the brief.
- **A hook denied something the plan truly needs:** do it yourself in the main session (the hook asks you), commit, and resume the executor.
- **A teammate's run state reached your branch** (`orch.sh status` says FOREIGN RUN): never resume it; `orch.sh init` moves it aside, and your next checkpoint removes it from the branch.
- **An irreversible step looks necessary** (data deletion, force push, schema drop): stop and ask the user.

**What the gate cannot see.** These need the reviewer, the sandbox, or a person: gitignored files (outside scope and DIRTY); a fail-before test satisfied only by an import error of a new symbol (the oracle sees a failure either way; mutation testing for high-risk code closes this); comments that contain assertion words; a test that reads its own log under `.orchestrator/logs/` to learn the step-marker nonce and forge an end marker; an executor that edits run state through a path the hook doesn't recognize and then gets that edit swept into an orchestrator checkpoint (review `git diff` of `.orchestrator/` before checkpointing if an executor reported anything odd); and effects outside the repository, such as network calls made from inside test code.

## 6. Sources

- MAST: https://arxiv.org/abs/2503.13657
- Anthropic, when to use multi-agent systems: https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them
- Anthropic, effective harnesses for long-running agents: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Cognition, Don't Build Multi-Agents: https://cognition.com/blog/dont-build-multi-agents
- Cognition, Multi-Agents: What's Actually Working: https://cognition.com/blog/multi-agents-working
- PatchDiff, "Are 'Solved Issues' in SWE-bench Really Solved Correctly?": https://arxiv.org/abs/2503.15223
- ImpossibleBench: https://arxiv.org/abs/2510.20270
- METR, reconciling slowdown with time horizons: https://metr.org/blog/2025-08-12-research-update-towards-reconciling-slowdown-with-time-horizons/
- Superpowers subagent-driven-development: https://github.com/obra/superpowers
- Karpathy-derived coding guidelines: https://github.com/forrestchang/andrej-karpathy-skills
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Claude Code permission modes (auto mode defaults): https://code.claude.com/docs/en/permission-modes
- Claude Code worktrees (base branch): https://code.claude.com/docs/en/worktrees
- Claude Code skills (lifecycle, compaction, allowed-tools): https://code.claude.com/docs/en/skills
- Stale worktree base reports: https://github.com/anthropics/claude-code/issues/41368 and https://github.com/anthropics/claude-code/issues/57768
- Subagent git commands moving the parent branch: https://github.com/anthropics/claude-code/issues/55708
- symlinkDirectories blocking worktree cleanup: https://github.com/anthropics/claude-code/issues/40259
- opencode V2 agents, tools, skills: https://opencode.ai/v2/docs/agents/ , https://opencode.ai/v2/docs/tools/ , https://opencode.ai/v2/docs/skills/

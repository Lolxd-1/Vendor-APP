# Parallelism reference

Parallel agents trade tokens and conflict risk for wall-clock time. Parallel *writers* are the riskiest shape in multi-agent systems: each one makes implicit decisions (naming, error style, edge-case handling) the others cannot see. Default to sequential. Go parallel only when it is provably safe and the wave is big enough to matter.

## Always safe
- Read-only scouts and reviewers. Keep it to at most 3 per message so their summaries don't flood your context.

## Parallel-safety checks for writers (every answer must be YES)
1. Write-sets are disjoint, including tests, fixtures, snapshots, and generated files.
2. No task in the wave consumes a contract that another task in the same wave produces. Shared contracts are already committed.
3. No task touches a hot file: lockfiles, dependency manifests, migrations, DB schema, route/DI/plugin registries, barrel or index re-exports, i18n catalogs, global config, CI, codegen output.
4. Each task's Verify is hermetic: unit or focused tests only; no fixed ports; no shared DB, queue, or container; no writes outside its worktree.
5. No task installs or upgrades dependencies.
6. The harness gives each agent its own worktree based on your HEAD (Claude Code: `isolation: "worktree"` on the dispatch plus `worktree.baseRef: "head"` in `.claude/settings.json`). No such isolation (opencode, for one) means sequential.
7. Imports resolve inside the worktree. Editable installs (`pip install -e`) and workspace links (npm, pnpm, yarn workspaces) that point at the main checkout make worktree tests silently run the main checkout's code.
8. Wave width is at most 3 (hard maximum 5). Every extra agent adds a full context to pay for and a branch to merge.
9. No task in the wave is high-risk (its brief, or `orch.sh risk` on the paths it will touch). High-risk tasks run sequentially, so their review sees exactly their change.

Any NO means sequential. Log the decision in LEDGER.md either way.

## Worktree protocol (Claude Code)

One-time setup (the installer does it): `.claude/settings.json` contains `"worktree": {"baseRef": "head"}`. Without it, worktrees branch from `origin/<default>` and executors silently work on stale code. `orch.sh` keeps `.claude/worktrees/` out of `git status` through `.git/info/exclude`. Dependencies must be reachable inside a worktree: list folders such as `node_modules` in `worktree.symlinkDirectories`, and gitignored env files in `.worktreeinclude`; otherwise tests cannot run there. The gate ignores those untracked symlinks.

Before the wave:
1. `orch.sh dispatch --worktree T05 T06 T07`. It marks each task `[~] mode=worktree`, commits the briefs (a worktree sees committed files only), and prints one BASE and one prompt per task.
2. Dispatch all wave tasks in one message, each with `isolation: "worktree"`, the printed model and prompt, and no `name`. Every executor checks that BASE is an ancestor of its HEAD and reports BLOCKED if not.

After all of them return, process the tasks in ID order:
3. Find each task's worktree path (from the Agent result, otherwise `git worktree list`).
4. `orch.sh gate <ID> --agent <agent ID> <worktree-path>`. On FAIL, run the fix loop in that worktree by resuming the same agent. On PASS it prints the merge command.
5. `orch.sh merge <ID> <worktree-path>`: from the main checkout it merges the worktree branch with `--no-ff`, re-runs the task's Verify on the run branch (not `gate`: after several merges, the diff since BASE includes other tasks' files), marks the task `[x] merged <sha7>`, then removes the worktree and deletes its branch (`branch -d` refuses unmerged work, which is the check you want).
   - Conflict: it aborts the merge and leaves the worktree. Re-run the task sequentially on the new HEAD (`orch.sh dispatch <ID>` without `--worktree`) with a fresh executor and this Notes line in its brief: "Parallel attempt conflicted; branch <branch> shows the earlier work." Never hand-resolve a non-trivial conflict in your own context.
   - Verify fails after the merge: an interaction with an earlier merge in the wave. Fix it before the next merge.

After the whole wave: `orch.sh verify-all`. A regression that no individual task showed is an interaction bug: write one fix brief (Context: the failing log path and the wave's task IDs; Write-set: the files those tasks touched; Verify: the global Verify) and dispatch it to sonnet, or opus if the bug is subtle.

## Sequential protocol (the default)

One executor at a time, in the main checkout. While it works, make no git writes there (commit, checkout, stash): the index is shared. You may edit STATE.md, LEDGER.md, and brief Notes; checkpoint after the executor returns.

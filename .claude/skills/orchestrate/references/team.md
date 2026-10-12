# Running the kit in a shared repository

For repositories where several engineers, and possibly non-engineers, work at once on code that runs in production.

## Contents
1. Who approves what
2. Risk policy: .orchestrate-policy
3. Run state never reaches main
4. Hooks, workspace trust and CI
5. Sandboxing and credentials
6. Keeping up with main
7. Distributing the kit

## 1. Who approves what

The requester confirms intent: the Examples and the plain-language summary, and the behavior they see on the running app or a preview. They do not approve code. Separation of duties (SOC 2 CC8.1, ISO 27001 A.8.32) expects a qualified reviewer other than the author for production changes, and GitHub does not count a requester's approval of their own agent's pull request.

| Tier | What the diff touches | Who approves before merge |
|---|---|---|
| low / med | anything not matched by the risk policy | the requester confirms behavior; normal code review on the PR |
| high | auth, sessions, permissions, payments and billing, migrations and schemas, SQL, secrets and `.env`, dependency manifests and lockfiles, CI, Docker and infrastructure, `.claude/`, CODEOWNERS (`orch.sh risk` lists the matches) | a code owner of those paths, on the PR |

Put risky paths under CODEOWNERS and require code-owner review in branch protection, so the rule holds whoever opens the PR. The kit reports the tier in the plan, the gate output, the final report and the PR description; it never merges.

## 2. Risk policy: .orchestrate-policy

An optional file at the repository root, one rule per line (`#` starts a comment). Commit it and give it a code owner: it is itself a high-risk path.

```text
# more paths that always count as high risk (extended regular expressions, matched case-insensitively)
high (^|/)src/ledger/
high (^|/)config/production\.
# paths the default patterns flag that are not risky in this repo
exempt (^|/)docs/
# files allowed to contain credential-like test values (test certificates, fixtures)
secret-ok (^|/)test/fixtures/certs/
```

## 3. Run state never reaches main

`.orchestrator/` is committed on the run branch while the run is active, so any machine or tool can resume it. `orch.sh finish` removes it from the branch in a final commit and keeps a full copy under `.git/orch/archive/` (and in history). STATE records the owner and the branch; `status`, `init`, the hooks and the CLAUDE.md pointer ignore a run whose branch is not the current one, so a mistake can't pull a teammate's session into someone else's run.

Two optional safety nets:
- A CI check that fails a pull request still carrying run state:
  ```yaml
  - name: No orchestrator run state
    run: test ! -e .orchestrator || { echo "run 'orch.sh finish' before merging"; exit 1; }
  ```
- Squash-merge orchestrated pull requests: the `chore(orch)` bookkeeping commits (some made with `--no-verify`) then never enter main's history. Repositories that require signed commits or DCO sign-off on every commit need squash-merge anyway.

## 4. Hooks, workspace trust and CI

`install.sh` adds two hooks to `.claude/settings.json`:
- `orch.sh hook-pretool` (PreToolUse on Bash, PowerShell, Edit, Write, MultiEdit, NotebookEdit). It is quiet unless a run is active on the current branch. Then it denies the kit's subagents: pushes; history-changing git commands; staging with `-A`, `-u` or `.`; package installs; infrastructure, cloud and deploy CLIs; publishing; destructive database commands and migrations against a remote `DATABASE_URL`; network access beyond localhost; reading `.env` or credential files; edits to run state or `.git/`; recursive deletes outside the checkout; and edits outside the write-sets of the tasks in progress. It denies force pushes and remote branch deletes for everyone, and asks the main session before a push, `reset --hard`, `clean -f`, checkout or switch, a history rewrite, publishing or deploy scripts, mutating cloud or infrastructure commands, or destructive database commands. Every decision names its rule. It checks the command text, after joining continued lines and looking inside `bash -c` and package runners such as `npx`; it does not evaluate variables or decode obfuscated commands.
- `orch.sh hook-session` (SessionStart): after startup, resume or compaction, it puts the active run's NEXT ACTION back in context.

Claude Code runs project hooks only after the folder's workspace-trust dialog has been accepted (always in `claude -p`); check with `/hooks`. On native Windows, hooks run in Git Bash. A hook that crashes or times out fails open (the action proceeds), so the gate stays the backstop.

In CI or scripts, run Claude Code without `--bare`: bare mode skips skills, subagents and project hooks, which removes the kit's guardrails. The managed Code Review check never blocks a merge by itself; gate on your own CI.

## 5. Sandboxing and credentials

The hook stops honest mistakes and reward hacking. It is not a security boundary: an agent determined to obfuscate a command can get past pattern rules. For a production repository:
- Turn on Claude Code's sandbox (filesystem and network isolation for Bash) on macOS, Linux or WSL2. It does not run on native Windows: there, work inside WSL2 or a dev container.
- Keep production credentials out of the development environment. `.env` and `DATABASE_URL` point at local or disposable services; worktrees copy gitignored files listed in `.worktreeinclude`, so list only what tests need.
- Give the account the agent runs as no rights to deploy, migrate production, or push to protected branches.
- Teams can enforce the same rules for everyone with managed settings (deny rules, `allowManagedHooksOnly`).

## 6. Keeping up with main

With many people merging, the run branch falls behind. `orch.sh sync` fetches the default branch and reports how far behind the run is and which files changed on both sides; Phase 4 merges the default branch locally before `verify-all`. Keep runs short (a day or two at most), and split size L work into several pull requests, each green on its own: reviewers catch far fewer defects in large diffs, and merge queues test each PR against the latest main.

## 7. Distributing the kit

Commit the kit (`.claude/skills/orchestrate/`, `.claude/agents/orch-*.md`, `.opencode/agents/`, the settings keys) so every teammate and every CI job runs the same version; re-run `install.sh` to update. After changing anything, run `bash .claude/skills/orchestrate/scripts/selftest.sh` on each platform your team uses.

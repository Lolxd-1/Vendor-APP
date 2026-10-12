<!-- orchestrate-kit:start -->
## Orchestrated builds
For features, refactors, migrations, or fixes that span several files or steps, use the `orchestrate` skill (`.claude/skills/orchestrate/SKILL.md`).
If `.orchestrator/STATE.md` exists, its `status:` is not `done`, and its `branch:` is the current branch, a run is in progress: load that skill and follow its Resume protocol before doing anything else. A STATE.md whose `branch:` is another branch belongs to someone else's run: ignore it.
Subagents: ignore this section and follow your dispatch.
<!-- orchestrate-kit:end -->

# ORCHESTRATOR STATE
<!-- Source of truth for this run. Any agent or tool resuming work reads this first. -->
run: <slug>
owner: <owner>
branch: <branch>
run-base: <sha>
status: recon
updated: <UTC time> · <tool/model>
<!-- status: recon | planning | awaiting-approval | executing | integrating | done | blocked -->

## NEXT ACTION
Phase 1 recon: find the verify commands, run baseline, scout, read the files to change.

## Baseline
<orch.sh baseline records per-step results in .orchestrator/baseline/; note here which steps or tests already fail>

## Tasks
<!-- one line per task, starting at column 0 with "- [". orch.sh dispatch, gate, review, accept and merge
  maintain the status and the key=value fields; edit by hand only to add tasks, or to mark [!] or [-]. e.g.
  - [x] T01 Add Money type — w1 — done 1a2b3c4..5d6e7f8 (gate PASS)
  - [~] T02 Parse amounts — w2 — base=5d6e7f8a1b attempt=1 agent=<id>
  - [ ] T03 Wire checkout — w3 — deps T02
  - [!] T04 Refund flow — blocked: <reason>
  - [-] T05 Legacy export — dropped: <ruling>
-->

## Open questions
- none

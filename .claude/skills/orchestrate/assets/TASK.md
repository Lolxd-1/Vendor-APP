# T01: <title>
Wave: 1 · Deps: none · Risk: low · Model: sonnet · Oracle: fail-before
<!-- Risk: low | med | high. Oracle: fail-before (new or changed tests must fail on the old code: features and
     bug fixes), pass-before (tests must also pass on the old code: refactors over existing tests), or none
     (nothing testable: docs, config; say why in Notes). -->

## Goal
<what must be true when this task is done, in 1 or 2 sentences>

## Context
<at most 5 lines: why this exists, where it fits, what earlier tasks produced>

## Read first
- `<path>`: <why; symbols to look at>

## Write-set
- create: <path/to/new_file>
- modify: <path/to/existing_file>
- test: <path/to/test_file>

## Contracts
- Consumes: `<exact signature>` (from <task or existing code at path:line>)
- Produces: `<exact signature>`

## Steps
1. <concrete action>

## Test cases
- TC1 (happy) `test: <exact test name>`: <input> -> <expected output>
- TC2 (edge) `test: <exact test name>`: <input> -> <expected output>
- TC3 (error) `test: <exact test name>`: <input> -> <expected error, message, status>

## Verify
```bash
# One command per line (chain dependent commands with &&). Focused tests for this task, run so they print
# each test's name, plus typecheck or lint of touched files. Every line must exit non-zero on failure.
```

## Done when
- [ ] every test case above passes via Verify
- [ ] <task-specific criterion>

## Out of scope
- <adjacent change the executor must not make>

## Notes
<rulings, answers to executor questions, discoveries from earlier tasks>

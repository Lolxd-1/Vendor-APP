#!/usr/bin/env bash
# orch.sh: deterministic helpers for the `orchestrate` skill.
# Prints short, decision-ready summaries; full command output goes to
# .orchestrator/logs/ so no agent pays tokens for noise.
# Portable: bash 3.2+ (macOS), Linux, Git Bash on Windows. Needs git, awk, grep, sed, sort.
set -u

ORCH=".orchestrator"
SKILL_DIR=$(cd "$(dirname "$0")/.." && pwd)
TAIL_N=${ORCH_TAIL:-30}          # log lines shown per run; the full log path is always printed
TIMEOUT_S=${ORCH_TIMEOUT:-540}   # seconds per block run (needs GNU timeout or gtimeout); 0 disables. Under the Bash tool's 600 s cap.
TAB=$(printf '\t')
LAST_LOG=""; LAST_NONCE=""

ROOT_CACHE=""; PRIV_CACHE=""   # filled once per command (each git call costs on Windows)

die() { printf 'orch: %s\n' "$*" >&2; exit 2; }
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
root() {
  if [ -n "$ROOT_CACHE" ]; then printf '%s\n' "$ROOT_CACHE"; return 0; fi
  git rev-parse --show-toplevel 2>/dev/null || die "not inside a git repository"
}
tmpf() { mktemp 2>/dev/null || mktemp -t orch; }
tmpdir() { mktemp -d 2>/dev/null || mktemp -d -t orch; }
q1() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }   # quote for generated shell code
short() { git -C "$1" rev-parse --short "$2" 2>/dev/null || printf '%.7s' "$2"; }

usage() {
  cat <<'EOF'
usage: orch.sh <command> [args]
 run lifecycle
  init <slug>                 create .orchestrator/ for a new run (moves a finished or foreign run aside)
  status                      one-screen summary: state, next action, open tasks, git
  baseline                    run PLAN "Verify (global)" and "Verify (per task)" step by step; record results
  dispatch [--worktree] <ID>..  mark tasks [~], checkpoint, print BASE and the exact dispatch prompt(s)
  gate <ID> [BASE] [dir] [--agent <id>] [--check]
                              full task gate; on PASS marks the task [x] (exit 0), or needs review (exit 4)
  review <ID>                 accept a high-risk task once its review file says APPROVE for the current code
  accept <ID> <ruling>        mark a gated task done despite open review findings, logging the ruling
  merge <ID> <worktree-dir>   merge a gated worktree task into the run branch, re-verify, clean up
  verify-all                  run PLAN "Verify (global)"; exit 0 = no regressions against the baseline
  sync                        fetch the default branch; report how far behind and which files overlap
  finish [--force]            close the run: archive state locally, remove .orchestrator/ from the branch
  pr-body                     print a pull request description built from the run's evidence
 tools
  checkpoint <message>        commit .orchestrator/ only; prints HEAD. "dispatch <IDs>" always commits
  base <ID>                   print the BASE commit of a task
  verify <ID> [dir]           run only the task's Verify block (from the committed brief)
  slop <BASE>                 flag debris, secrets, snapshot and dependency changes since BASE (informational)
  risk [BASE]                 risk tier of the files changed since BASE (default: the run base)
  quick                       checks for a small change made without a run (secrets, debris, risky paths)
  hook-pretool | hook-session Claude Code hooks (installed by install.sh)
EOF
}

# ---------------------------------------------------------------- patterns
# Paths that make a change high-risk whatever the plan says (matched case-insensitively).
# Extend per project in .orchestrate-policy: "high <ERE>" adds a pattern, "exempt <ERE>" excludes paths.
RISK_RE='(^|/)(auth|authn|authz|oauth|oidc|saml|sso|login|logout|signin|signup|session|sessions|passwords?|permissions?|rbac|acls?|policy|policies|security|crypto|secrets?|payments?|billing|invoices?|checkout|money|wallets?|ledger|refunds?|subscriptions?)([/._-]|$)|migrat|(^|/)schema[^/]*$|\.sql$|(^|/)\.github/workflows/|(^|/)\.gitlab-ci\.yml$|(^|/)jenkinsfile$|(^|/)(terraform|infra|infrastructure|k8s|kubernetes|helm|charts|deploy|deployment|deployments)/|\.tfvars?$|\.tf$|(^|/)dockerfile|(^|/)docker-compose[^/]*$|(^|/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|pipfile(\.lock)?|uv\.lock|go\.(mod|sum)|cargo\.(toml|lock)|gemfile(\.lock)?|composer\.(json|lock)|pom\.xml|build\.gradle(\.kts)?)$|(^|/)\.env|(^|/)codeowners$|(^|/)\.claude/|(^|/)\.orchestrate-policy$'
TEST_PATH_RE='(^|/)(tests?|__tests__|specs?|testing|e2e)/|[._-](test|spec|e2e)\.[A-Za-z0-9]+$|(^|/)test_[^/]*\.py$|_test\.(go|py|rb|exs?)$|(Test|Tests|Spec)\.(java|kt|cs|swift|scala)$'
ASSERT_RE='assert|expect|should|\.to[(.]|t\.(error|fatal|fail)|require\.|verify\(|check\(|refute|must|raises|throws|tobe|toequal|[[:space:]]\[\[? |^\[\[? |^[[:space:]]*test |(diff|cmp) |grep -q'
TESTDEF_RE='(^|[^A-Za-z_])(it|test|describe|context)[ (]|def test|func Test|#\[test\]|@Test|[Tt]est[A-Z_][A-Za-z0-9_]*\('
MANIFEST_RE='(^|/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Pipfile|go\.mod|Cargo\.toml|Gemfile|composer\.json|pom\.xml|build\.gradle(\.kts)?)$'
SECRET_RE='AKIA[0-9A-Z]{16}|(aws_secret_access_key|aws_secret_key)[^A-Za-z0-9/+=]{1,8}[A-Za-z0-9/+=]{40}|(sk|rk)_live_[0-9A-Za-z]{16,}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}|xox[abposr]-[A-Za-z0-9-]{10,}|-----BEGIN ([A-Z]+ )?PRIVATE KEY-----|AIza[0-9A-Za-z_-]{35}|sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{36}|SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}'
SECRET_URL_RE='(postgres(ql)?|mysql|mariadb|mongodb(\+srv)?|rediss?|amqps?)://[^:/@ ]+:[^@ /]+@[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+'
SECRET_OK_RE='orch-allow-secret|AKIAIOSFODNN7''EXAMPLE|wJalrXUtnFEMI/K7MDENG/bPxRfiCY''EXAMPLEKEY|@(localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal)([:/]|$)'

# ---------------------------------------------------------------- git and file helpers
# Per-clone private state that is never committed: <git common dir>/orch/ (shared by all worktrees).
priv() {
  local d
  if [ -n "$PRIV_CACHE" ]; then printf '%s\n' "$PRIV_CACHE"; return 0; fi
  d=$(git -C "$1" rev-parse --git-common-dir 2>/dev/null) || return 1
  case $d in /*|[A-Za-z]:*) ;; *) d="$1/$d" ;; esac
  mkdir -p "$d/orch" 2>/dev/null
  printf '%s\n' "$d/orch"
}
# Main checkout of the repository that contains dir $1 (differs from $1 inside a linked worktree).
main_root() {
  local d
  d=$(git -C "$1" rev-parse --git-common-dir 2>/dev/null) || return 1
  case $d in /*|[A-Za-z]:*) ;; *) d="$1/$d" ;; esac
  (cd "$d/.." 2>/dev/null && pwd -P)
}
ckpt_record() { local p; p=$(priv "$1") && printf '%s\n' "$2" >> "$p/checkpoints"; }
ckpt_known() { local p; p=$(priv "$1") && [ -f "$p/checkpoints" ] && grep -qxF "$2" "$p/checkpoints"; }

# First fenced code block under the first heading that starts with $2.
section_block() {
  awk -v h="$2" '
    { sub(/\r$/, "") }
    index($0, h) == 1 { insec = 1; next }
    insec && /^## / { exit }
    insec && /^```/ { if (inblock) exit; inblock = 1; next }
    inblock { print }
  ' "$1"
}
# All lines of the section under the first heading that starts with $2.
section_text() {
  awk -v h="$2" '{ sub(/\r$/, "") } index($0, h) == 1 { insec = 1; next } insec && /^## / { exit } insec { print }' "$1"
}
# The parts of a brief the gate enforces: Risk, Oracle, the Write-set entries, the Test cases and the
# Verify block. Notes and prose may change freely.
spec_of() {
  [ -f "$1" ] || return 0
  echo "risk=$(brief_meta "$1" Risk) oracle=$(brief_meta "$1" Oracle)"
  echo "## write-set"; write_set_l "$1"
  echo "## test cases"; section_text "$1" "## Test cases" | sed 's/[[:space:]]*$//' | grep . || true
  echo "## verify"; section_block "$1" "## Verify"
}
# Lower-cased value of "<Key>:" in a brief's header ("Wave: 1 · Deps: none · Risk: high · Model: sonnet · Oracle: none").
brief_meta() {
  awk -v k="$2" 'NR > 8 { exit } match($0, k ":[ \t]*[A-Za-z0-9_-]+") {
    v = substr($0, RSTART + length(k) + 1, RLENGTH - length(k) - 1); gsub(/[ \t]/, "", v); print tolower(v); exit }' "$1"
}
# "<label>\t<path>" for each entry under "## Write-set" ("- create: path", "- test: `path with spaces`").
write_set_l() {
  awk -f <(printf '%s' '
    { sub(/\r$/, "") }
    /^## Write-set/ { insec = 1; next }
    insec && /^## / { exit }
    insec && /^[ \t]*[-*][ \t]+/ {
      line = $0; sub(/^[ \t]*[-*][ \t]+/, "", line); label = ""
      if (match(line, /^[A-Za-z]+:[ \t]*/)) { label = tolower(substr(line, 1, RLENGTH)); sub(/:[ \t]*$/, "", label); line = substr(line, RLENGTH + 1) }
      if (substr(line, 1, 1) == "`") { line = substr(line, 2); i = index(line, "`"); if (i > 0) line = substr(line, 1, i - 1) }
      else { split(line, parts, /[ \t]+/); line = parts[1]; gsub(/`/, "", line) }
      if (line != "" && line !~ /^</) print label "\t" line
    }
  ') "$1"
}
write_set() { write_set_l "$1" | cut -f2; }

# Print each path on stdin that no write-set entry (one per line in file $1) covers.
# Entries match literally (so "app/[id]/page.tsx" works); a trailing "/" covers the subtree;
# "*" matches within one path segment and "**" across segments.
out_of_scope() {
  awk -v wsfile="$1" -f <(printf '%s' '
    function esc(c) { return index("\\^$.|?+()[]{}", c) ? "\\" c : c }
    function glob2re(s,   out, i, c) {
      out = ""
      for (i = 1; i <= length(s); i++) {
        c = substr(s, i, 1)
        if (c == "*") { if (substr(s, i + 1, 1) == "*") { out = out ".*"; i++ } else out = out "[^/]*" }
        else out = out esc(c)
      }
      return "^" out "$"
    }
    BEGIN { n = 0; while ((getline e < wsfile) > 0) { if (e == "") continue; n++; ent[n] = e; if (index(e, "*")) re[n] = glob2re(e) } }
    {
      f = $0; ok = 0
      for (i = 1; i <= n && !ok; i++) {
        e = ent[i]
        if (f == e) ok = 1
        else if (substr(e, length(e), 1) == "/" && index(f, e) == 1) ok = 1
        else if ((i in re) && f ~ re[i]) ok = 1
      }
      if (!ok) print f
    }
  ')
}

# Uncommitted paths in dir $1 outside .orchestrator/, one per line (both sides of a rename).
# Untracked symlinks to directories are skipped: worktree.symlinkDirectories links such as node_modules look like that.
dirty_files() {
  git -C "$1" -c core.quotepath=off status --porcelain --untracked-files=all 2>/dev/null |
  while IFS= read -r line; do
    rest=${line#???}
    while [ -n "$rest" ]; do
      case $rest in
        *' -> '*) p=${rest%% -> *}; rest=${rest#* -> } ;;
        *) p=$rest; rest="" ;;
      esac
      p=${p#\"}; p=${p%\"}
      case $p in "$ORCH"/*) continue ;; esac
      case $line in '?? '*) if [ -L "$1/${p%/}" ] && [ -d "$1/${p%/}" ]; then continue; fi ;; esac
      printf '%s\n' "$p"
    done
  done
}

# "<file>\t<line>\t<text>" for every line added in dir $1 since $2, outside .orchestrator/
# (with $3 = all: everything except .orchestrator/logs/).
added_lines() {
  local ex=":(exclude)$ORCH"
  [ "${3:-}" = all ] && ex=":(exclude)$ORCH/logs"
  git -C "$1" -c core.quotepath=off diff -U0 --no-color --no-ext-diff "$2" HEAD -- . "$ex" | awk '
    /^\+\+\+ / { file = $0; sub(/^\+\+\+ (b\/)?/, "", file); sub(/\t$/, "", file); next }
    /^@@/ { s = $0; sub(/^@@ -[0-9,]+ \+/, "", s); sub(/[^0-9].*$/, "", s); ln = s + 0; next }
    /^\+/ { if (file != "/dev/null") printf "%s\t%d\t%s\n", file, ln, substr($0, 2); ln++ }
  '
}
# The same for uncommitted work in dir $1: changes against HEAD plus untracked files.
added_lines_wt() {
  git -C "$1" -c core.quotepath=off diff -U0 --no-color --no-ext-diff HEAD -- . ":(exclude)$ORCH" | awk '
    /^\+\+\+ / { file = $0; sub(/^\+\+\+ (b\/)?/, "", file); sub(/\t$/, "", file); next }
    /^@@/ { s = $0; sub(/^@@ -[0-9,]+ \+/, "", s); sub(/[^0-9].*$/, "", s); ln = s + 0; next }
    /^\+/ { if (file != "/dev/null") printf "%s\t%d\t%s\n", file, ln, substr($0, 2); ln++ }
  '
  git -C "$1" -c core.quotepath=off ls-files --others --exclude-standard -- . ":(exclude)$ORCH" |
  while IFS= read -r f; do
    [ -f "$1/$f" ] && [ ! -L "$1/$f" ] && awk -v f="$f" '{ printf "%s\t%d\t%s\n", f, NR, $0 }' "$1/$f" 2>/dev/null
  done
}

# ---------------------------------------------------------------- scanners
# Added lines that usually mean debris, plus deleted tests and snapshot changes. Reads added_lines on stdin;
# $1 = dir, $2 = base (for the name-status part; empty to skip). Prints at most $3 findings (0 = all).
slop_scan() {
  {
    awk -F'\t' -f <(printf '%s' '
      BEGIN {
        p = "(TODO|FIXME|XXX|HACK)([^A-Za-z]|$)"
        p = p "|console\\.(log|debug|trace)\\("
        p = p "|(^|[^A-Za-z_])debugger([^A-Za-z_]|$)"
        p = p "|pdb\\.set_trace|breakpoint\\(\\)|binding\\.pry"
        p = p "|(it|describe|test|context)\\.only\\("
        p = p "|(it|describe|test)\\.skip\\(|(^|[^A-Za-z_])x(it|describe)\\("
        p = p "|@pytest\\.mark\\.skip|t\\.Skip\\(|@Disabled|@Ignore"
        p = p "|eslint-disable|@ts-ignore|@ts-nocheck|as any([^A-Za-z_]|$)"
        p = p "|#[ \t]*type:[ \t]*ignore|#[ \t]*noqa|//[ \t]*nolint"
        p = p "|except[^:]*:[ \t]*pass|catch[ \t]*(\\([^)]*\\))?[ \t]*\\{[ \t]*\\}"
        p = p "|--update-?snapshots?|--passWithNoTests"
      }
      { text = $0; sub(/^[^\t]*\t[^\t]*\t/, "", text); if (text ~ p) printf "%s:%s: %s\n", $1, $2, text }
    ')
    if [ -n "$2" ]; then
      git -C "$1" -c core.quotepath=off diff --name-status --no-renames "$2" HEAD -- . ":(exclude)$ORCH" | awk -F'\t' -f <(printf '%s' '
        $1 == "D" && ($2 ~ /(^|\/)(tests?|__tests__|spec)\// || $2 ~ /[._-](test|spec)\.[A-Za-z]+$/) { print "deleted test file: " $2 }
        $1 != "D" && ($2 ~ /\.snap$/ || $2 ~ /__snapshots__\//) { print "snapshot changed: " $2 " (confirm the new output is intended, not regenerated to pass)" }
      ')
    fi
  } | awk -v max="${3:-0}" '
    { n++; if (max == 0 || n <= max) print }
    END { printf "slop: %d finding(s)%s\n", n, (max > 0 && n > max) ? " (showing " max "; run: orch.sh slop <BASE>)" : "" }
  '
}
# Credential-like values in added_lines on stdin. Prints "file:line" only (never the value).
# Paths matching "secret-ok <ERE>" lines in <root $1>/.orchestrate-policy are exempt (test certificates, say).
secret_scan() {
  local ok="" pol="${1:-.}/.orchestrate-policy" l
  if [ -f "$pol" ]; then
    while IFS= read -r l; do l=${l%$'\r'}; case $l in 'secret-ok '*) ok="${ok:+$ok|}${l#secret-ok }" ;; esac; done < "$pol"
  fi
  grep -E -- "$SECRET_RE|$SECRET_URL_RE" | grep -Ev -- "$SECRET_OK_RE" |
    awk -F'\t' -v ok="$ok" '(ok == "" || $1 !~ ok) && !seen[$1 ":" $2]++ { print $1 ":" $2 }'
}
# Changed files on stdin that match the risk patterns (and the project policy in dir $1).
risk_hits() {
  local re=$RISK_RE ex="" pol="$1/.orchestrate-policy"
  if [ -f "$pol" ]; then
    while IFS= read -r l; do
      l=${l%$'\r'}
      case $l in 'high '*) re="$re|${l#high }" ;; 'exempt '*) ex="${ex:+$ex|}${l#exempt }" ;; esac
    done < "$pol"
  fi
  if [ -n "$ex" ]; then grep -Ei -- "$re" | grep -Eiv -- "$ex"; else grep -Ei -- "$re"; fi
  return 0
}
# Exit 1 when the log in $1 shows a test runner that ran zero tests and nothing shows tests that ran.
zero_tests() {
  awk -f <(printf '%s' '
    { l = substr($0, 1, 4000); gsub(/\033\[[0-9;]*[A-Za-z]/, "", l); gsub(/\r/, "", l) }
    l ~ /^(# |ℹ )?tests [1-9]/ { pos = 1 }
    l ~ /[1-9][0-9]* (passed|passing)/ { pos = 1 }
    l ~ /^ok[ \t]/ && l !~ /no tests to run/ && l !~ /no test files/ { pos = 1 }
    l ~ /--- PASS/ || l ~ /running [1-9][0-9]* tests?/ || l ~ /[1-9][0-9]* examples?,/ { pos = 1 }
    l ~ /OK \([1-9][0-9]* tests?/ || l ~ /Tests run: [1-9]/ { pos = 1 }
    l ~ /^(# |ℹ )?tests 0/ || l ~ /No tests found/ || l ~ /No test files found/ || l ~ /no tests ran/ { zero = 1 }
    l ~ /collected 0 items/ || l ~ /(^|[^0-9])0 passing/ || l ~ /no tests to run/ || l ~ /running 0 tests/ { zero = 1 }
    l ~ /(^|[^0-9])0 examples?/ || l ~ /No tests executed/ || l ~ /Tests run: 0[^0-9]/ || l ~ /Tests: +0 total/ { zero = 1 }
    END { exit (zero && !pos) ? 1 : 0 }
  ') "$1"
}
# Normalized failure lines of step $2 in log $1 ($3: a path prefix to strip; $4: the run's marker nonce).
# Free-standing numbers become # so timings, counts and line numbers don't make old failures look new;
# digits inside names (test_case_2, file2.ts) are kept.
step_sigs() {
  awk -v n="$2" -v pre="$3" -v mk="@@orch-$4 step " -f <(printf '%s' '
    function nums(l,   out, i, c, prev, L) {
      out = ""; L = length(l); i = 1; prev = ""
      while (i <= L) {
        c = substr(l, i, 1)
        if (c ~ /[0-9]/) {
          if (prev ~ /[A-Za-z_]/) { while (i <= L && substr(l, i, 1) ~ /[0-9]/) { out = out substr(l, i, 1); i++ } }
          else { while (i <= L && substr(l, i, 1) ~ /[0-9]/) i++; out = out "#" }
          prev = "0"; continue
        }
        out = out c; prev = c; i++
      }
      return out
    }
    index($0, mk n " begin@@") == 1 { on = 1; next }
    index($0, mk n " end ") == 1 { on = 0; next }
    on {
      l = substr($0, 1, 4000); gsub(/\033\[[0-9;]*[A-Za-z]/, "", l); gsub(/\r/, "", l)
      if (l !~ /(FAIL|Fail|fail|ERROR|Error|error|✕|✗|not ok|panic|Traceback|Exception|exception)/) next
      if (pre != "") { i = index(l, pre); while (i > 0) { l = substr(l, 1, i - 1) substr(l, i + length(pre)); i = index(l, pre) } }
      l = nums(substr(l, 1, 1000)); gsub(/[ \t]+/, " ", l); sub(/^ /, "", l); sub(/ $/, "", l)
      if (l != "") print substr(l, 1, 300)
    }
  ') "$1" | LC_ALL=C sort -u | head -n 5000
}

# ---------------------------------------------------------------- running blocks
TIMEOUT_BIN=""
find_timeout() {
  local t
  [ -n "$TIMEOUT_BIN" ] && return 0
  TIMEOUT_BIN=none
  for t in timeout gtimeout; do
    if command -v "$t" > /dev/null 2>&1 && "$t" --version 2>/dev/null | grep -q 'GNU coreutils'; then TIMEOUT_BIN=$t; return 0; fi
  done
}

# run_steps <block> <dir> <log name> <fast|all> <table out>
# Every line of the block is one step, run in one shell (cd and export carry over), and every step's
# exit code counts, including "a && b" lines that set -e lets through. "fast" stops at the first failure.
# A block with multi-line shell constructs runs as a single step under set -e -o pipefail.
# Writes "<n>\t<exit|->\t<secs>\t<command>" per step to the table; prints one line per step, the log
# tail and "--- exit N"; returns 0 only if every step passed. LAST_LOG holds the log path.
run_steps() {
  local block=$1 dir=$2 name=$3 mode=$4 table=$5 rr n i line script raw chk rc stepmode label s secs
  rr=$(root) || exit 2
  mkdir -p "$rr/$ORCH/logs"
  LAST_LOG="$rr/$ORCH/logs/$name-$(date -u +%Y%m%dT%H%M%SZ)-$$.log"
  # Step markers carry a per-run nonce, so test output can't forge or cut them.
  LAST_NONCE="$$${RANDOM}${RANDOM}"
  n=0
  while IFS= read -r line; do
    line=${line%$'\r'}
    case ${line#"${line%%[![:space:]]*}"} in ''|'#'*) continue ;; esac
    n=$((n + 1)); eval "ST_$n=\$line"
  done <<EOF
$block
EOF
  script=$(tmpf); raw=$(tmpf); chk=$(tmpf)
  stepmode=1
  i=1
  while [ "$i" -le "$n" ]; do
    eval "line=\$ST_$i"
    case $line in
      *'\'|*'|'|*'&&'|*'||'|*'{'|*'('|*' do'|do|*' then'|then|*' else'|else|*' in'|*'<<'*) stepmode=0 ;;
    esac
    printf 'orch_s%d() {\n%s\n}\n' "$i" "$line" >> "$chk"
    i=$((i + 1))
  done
  if [ "$stepmode" = 1 ] && ! bash -n "$chk" 2>/dev/null; then stepmode=0; fi
  {
    echo 'set -o pipefail'
    echo '__orch_rc=0; __orch_cur=0; __orch_t0=$SECONDS'
    echo "__orch_raw=$(q1 "$raw")"
    # A step that runs "exit" ends the script: record that step's own status on the way out.
    echo 'trap '\''__orch_x=$?; if [ "$__orch_cur" != 0 ]; then printf "%s\t%s\t%s\n" "$__orch_cur" "$__orch_x" "$((SECONDS - __orch_t0))" >> "$__orch_raw"; fi'\'' EXIT'
    if [ "$stepmode" = 1 ]; then
      i=1
      while [ "$i" -le "$n" ]; do
        eval "line=\$ST_$i"
        echo "printf '%s\\n' $(q1 "@@orch-$LAST_NONCE step $i begin@@ $line")"
        echo "__orch_t0=\$SECONDS; __orch_cur=$i"
        printf '{ %s\n}\n' "$line"
        echo '__orch_s=$?; __orch_cur=0'
        echo "printf '%s\\t%s\\t%s\\n' $i \"\$__orch_s\" \"\$((SECONDS - __orch_t0))\" >> $(q1 "$raw")"
        echo "printf '%s\\n' \"@@orch-$LAST_NONCE step $i end \$__orch_s@@\""
        if [ "$mode" = fast ]; then echo 'if [ "$__orch_s" -ne 0 ]; then exit 1; fi'
        else echo 'if [ "$__orch_s" -ne 0 ]; then __orch_rc=1; fi'; fi
        i=$((i + 1))
      done
    else
      printf '%s\n' "$block" > "$script.block"
      echo "printf '%s\\n' '@@orch-$LAST_NONCE step 1 begin@@ (whole block)'"
      echo '__orch_t0=$SECONDS'
      echo "bash -e -o pipefail $(q1 "$script.block")"
      echo '__orch_s=$?'
      echo "printf '%s\\t%s\\t%s\\n' 1 \"\$__orch_s\" \"\$((SECONDS - __orch_t0))\" >> $(q1 "$raw")"
      echo "printf '%s\\n' \"@@orch-$LAST_NONCE step 1 end \$__orch_s@@\""
      echo 'if [ "$__orch_s" -ne 0 ]; then __orch_rc=1; fi'
    fi
    echo 'exit $__orch_rc'
  } > "$script"
  echo "run: $name · log: ${LAST_LOG#"$rr"/}"
  find_timeout
  if [ "$TIMEOUT_S" -gt 0 ] 2>/dev/null && [ "$TIMEOUT_BIN" != none ]; then
    ( cd "$dir" && "$TIMEOUT_BIN" -k 10 "$TIMEOUT_S" bash "$script" < /dev/null ) > "$LAST_LOG" 2>&1
  else
    ( cd "$dir" && bash "$script" < /dev/null ) > "$LAST_LOG" 2>&1
  fi
  rc=$?
  : > "$table"
  if [ "$stepmode" = 1 ]; then
    i=1
    while [ "$i" -le "$n" ]; do
      eval "line=\$ST_$i"
      s=$(awk -F'\t' -v i="$i" '$1 == i { print $2 "\t" $3; exit }' "$raw")
      if [ -n "$s" ]; then printf '%s\t%s\t%s\n' "$i" "$s" "$line" >> "$table"; else printf '%s\t-\t0\t%s\n' "$i" "$line" >> "$table"; fi
      i=$((i + 1))
    done
  else
    s=$(awk -F'\t' '$1 == 1 { print $2 "\t" $3; exit }' "$raw")
    [ -n "$s" ] || s="-${TAB}0"
    printf '1\t%s\t(whole block: multi-line shell)\n' "$s" >> "$table"
  fi
  if [ "$rc" = 0 ] && awk -F'\t' '$2 == "-" { f = 1 } END { exit !f }' "$table"; then
    echo "INCOMPLETE: a step ended the shell early (an exit inside a step?), so later steps never ran"; rc=1
  fi
  awk -F'\t' '{
    c = $4; if (length(c) > 110) c = substr(c, 1, 107) "..."
    if ($2 == "-") printf "step %s NOT RUN: %s\n", $1, c
    else if ($2 == 0) printf "step %s PASS (%ss): %s\n", $1, $3, c
    else printf "step %s FAIL exit %s (%ss): %s\n", $1, $2, $3, c
  }' "$table"
  [ "$stepmode" = 1 ] || echo "note: the block has multi-line shell, so it ran as one script; put one command per line to get per-step results"
  if [ "$rc" = 124 ] || [ "$rc" = 137 ]; then
    if [ "$TIMEOUT_BIN" != none ] && [ "$TIMEOUT_S" -gt 0 ] 2>/dev/null; then echo "TIMEOUT: stopped after ${TIMEOUT_S}s (raise ORCH_TIMEOUT, or find what hangs)"; fi
  fi
  grep -v "^@@orch-$LAST_NONCE step " "$LAST_LOG" | tail -n "$TAIL_N"
  printf -- '--- exit %s\n' "$rc"
  rm -f "$script" "$script.block" "$raw" "$chk"
  i=1; while [ "$i" -le "$n" ]; do unset "ST_$i"; i=$((i + 1)); done
  [ "$rc" = 0 ]
}

# run_block <file> <heading> <dir> <log name> [fast|all] [table out]
run_block() {
  local blk rr tbl=${6:-}
  blk=$(section_block "$1" "$2")
  rr=$(root) || exit 2
  if ! printf '%s\n' "$blk" | grep -v '^[[:space:]]*#' | grep -q -v '^[[:space:]]*$'; then
    echo "orch: no commands in the fenced block under '$2' in ${1#"$rr"/}"
    return 3
  fi
  [ -n "$tbl" ] || tbl=$(tmpf)
  run_steps "$blk" "$3" "$4" "${5:-fast}" "$tbl"
}

# ---------------------------------------------------------------- baselines and regressions
# save_baseline <name> <table> <log> <dir> <nonce>: record each step's result and failure lines.
save_baseline() {
  local rr bd i rc
  rr=$(root) || exit 2; bd="$rr/$ORCH/baseline"
  mkdir -p "$bd"
  rm -f "$bd/$1".*
  cp "$2" "$bd/$1.steps"
  while IFS="$TAB" read -r i rc _ _; do
    case $rc in 0|-) ;; *) step_sigs "$3" "$i" "$4/" "$5" > "$bd/$1.$i.sigs" ;; esac
  done < "$2"
  git -C "$rr" rev-parse HEAD > "$bd/sha"
}
# regressions <name> <table> <log> <dir> <nonce> [baseline dir]: print what got worse than the baseline;
# return 1 if anything did. A step that didn't run at baseline has nothing to compare with, so it counts.
regressions() {
  local rr bd i rc secs cmd bline brc bcmd new reg=0 cnt
  rr=$(root) || exit 2; bd=${6:-"$rr/$ORCH/baseline"}
  if [ ! -f "$bd/$1.steps" ]; then
    if awk -F'\t' '$2 != 0 { bad = 1 } END { exit !bad }' "$2"; then echo "no baseline recorded for '$1': every failing step counts"; return 1; fi
    return 0
  fi
  while IFS="$TAB" read -r i rc secs cmd; do
    [ "$rc" = 0 ] && continue
    bline=$(awk -F'\t' -v i="$i" '$1 == i { print; exit }' "$bd/$1.steps")
    brc=$(printf '%s' "$bline" | cut -f2); bcmd=$(printf '%s' "$bline" | cut -f4-)
    if [ -z "$bline" ] || [ "$bcmd" != "$cmd" ]; then
      echo "REGRESSION step $i: no baseline for this command (the block changed since the baseline): $cmd"; reg=1
    elif [ "$rc" = - ]; then
      echo "REGRESSION step $i: did not run: $cmd"; reg=1
    elif [ "$brc" = 0 ]; then
      echo "REGRESSION step $i: passed at baseline, fails now: $cmd"; reg=1
    elif [ "$brc" = - ] || [ ! -f "$bd/$1.$i.sigs" ]; then
      echo "REGRESSION step $i: it did not run at baseline, so there is nothing to compare with: $cmd"; reg=1
    else
      new=$(step_sigs "$3" "$i" "$4/" "$5" | LC_ALL=C comm -13 "$bd/$1.$i.sigs" - 2>/dev/null)
      if [ -n "$new" ]; then
        cnt=$(printf '%s\n' "$new" | wc -l | tr -d ' ')
        echo "REGRESSION step $i: $cnt new failure line(s) since the baseline: $cmd"
        printf '%s\n' "$new" | head -n 8 | sed 's/^/    /'
        reg=1
      else
        echo "pre-existing: step $i failed at baseline too, with no new failure lines: $cmd"
      fi
    fi
  done < "$2"
  awk -F'\t' 'NR == FNR { if ($2 != 0) b[$1] = $4; next } ($1 in b) && $2 == 0 && b[$1] == $4 { print "fixed: step " $1 " failed at baseline and passes now" }' "$bd/$1.steps" "$2"
  return $reg
}
plan_block() {  # global | pertask [PLAN file]
  local rr f=${2:-}; rr=$(root) || exit 2
  [ -n "$f" ] || f="$rr/$ORCH/PLAN.md"
  case $1 in global) section_block "$f" "## Verify (global)" ;; *) section_block "$f" "## Verify (per task)" ;; esac
}
# The newest commit made by orch.sh (a chore(orch) checkpoint) that touched path $2, in checkout $1.
# --basic-regexp: users' grep.patternType settings must not change what "chore(orch)" means.
last_ckpt() { git -C "$1" log -1 --format=%H --basic-regexp --grep='^chore(orch): ' HEAD -- "$2" 2>/dev/null; }
has_cmds() { printf '%s\n' "$1" | grep -v '^[[:space:]]*#' | grep -q -v '^[[:space:]]*$'; }

# ---------------------------------------------------------------- run state
st_get() { awk -v k="$2" 'index($0, k ":") == 1 { sub(/^[^:]*:[ \t]*/, ""); sub(/\r$/, ""); print; exit }' "$1"; }
task_line() {
  awk -v id="$2" '
    /^## Tasks/ { t = 1; next } t && /^## / { exit }
    t && substr($0, 1, 3) == "- [" && substr($0, 5, 2) == "] " { split(substr($0, 7), w, " "); if (w[1] == id) { print; exit } }
  ' "$1"
}
task_meta() { printf '%s\n' "$1" | tr ' ' '\n' | awk -v k="$2=" 'index($0, k) == 1 { print substr($0, length(k) + 1); exit }'; }
# state_task <STATE> <ID> <status char> <meta> <keep: 1 = keep other key=value tokens> [title for a new line]
state_task() {
  local tmp; tmp=$(tmpf)
  awk -v id="$2" -v st="$3" -v meta="$4" -v keep="$5" -v title="${6:-}" -v t="$(now)" -f <(printf '%s' '
    function rebuild(rest,   k, n, w, i, out, kv, key, nm, m, j) {
      k = index(rest, " — done "); if (k > 0) rest = substr(rest, 1, k - 1)
      nm = split(meta, m, " "); for (j = 1; j <= nm; j++) { key = m[j]; sub(/=.*/, "", key); newk[key] = 1 }
      n = split(rest, w, " "); out = ""; kv = ""
      for (i = 1; i <= n; i++) {
        if (w[i] ~ /^(base|attempt|agent|mode|gate|review|merge)=/) {
          key = w[i]; sub(/=.*/, "", key)
          if (keep == 1 && !(key in newk)) kv = kv " " w[i]
        } else out = out (out == "" ? "" : " ") w[i]
      }
      while (out ~ / —$/) sub(/ —$/, "", out)
      kv = kv (meta == "" ? "" : " " meta); sub(/^ /, "", kv)
      return out (kv == "" ? "" : " — " kv)
    }
    { sub(/\r$/, "") }
    /^updated:/ { sub(/^updated:[ \t]*[^ ]*/, "updated: " t) }
    /^## Tasks/ { intasks = 1; print; next }
    intasks && /^## / { if (!found) { print "- [" st "] " id (title == "" ? "" : " " title) (meta == "" ? "" : " — " meta); found = 1 }; intasks = 0 }
    intasks && !found && substr($0, 1, 3) == "- [" && substr($0, 5, 2) == "] " {
      split(substr($0, 7), w, " ")
      if (w[1] == id) { print "- [" st "] " rebuild(substr($0, 7)); found = 1; next }
    }
    { print }
    END { if (intasks && !found) print "- [" st "] " id (title == "" ? "" : " " title) (meta == "" ? "" : " — " meta) }
  ') "$1" > "$tmp" && cat "$tmp" > "$1"
  rm -f "$tmp"
}
state_status() {  # <STATE> <new status> [only-if-current-matches ERE]
  local tmp; tmp=$(tmpf)
  awk -v s="$2" -v only="${3:-}" '{ sub(/\r$/, "") } /^status:/ && !d { cur = $0; sub(/^status:[ \t]*/, "", cur); if (only == "" || cur ~ only) $0 = "status: " s; d = 1 } { print }' "$1" > "$tmp" && cat "$tmp" > "$1"
  rm -f "$tmp"
}
ledger() { local rr; rr=$(root) || exit 2; [ -f "$rr/$ORCH/LEDGER.md" ] && printf -- '- %s %s\n' "$(now)" "$*" >> "$rr/$ORCH/LEDGER.md"; return 0; }
brief_title() { awk 'NR == 1 { sub(/\r$/, ""); sub(/^#[ \t]*[^:]*:[ \t]*/, ""); print; exit }' "$1"; }

# The brief as the orchestrator last committed it (history of the run checkout $1), else as it was at
# BASE $4 (a dispatch checkpoint). Executors can't change either one.
frozen_brief() {
  local sha
  sha=$(last_ckpt "$1" "$ORCH/tasks/$2.md")
  if [ -n "$sha" ] && git -C "$1" show "$sha:$ORCH/tasks/$2.md" > "$3" 2>/dev/null; then return 0; fi
  [ -n "${4:-}" ] && git -C "$1" show "$4:$ORCH/tasks/$2.md" > "$3" 2>/dev/null
}

# Problems in a brief before it is dispatched: errors stop the dispatch, warnings don't.
lint_brief() {
  local f=$1 errs=0
  if ! write_set "$f" | grep -q .; then echo "ERROR $2: no paths under '## Write-set'"; errs=1; fi
  if ! has_cmds "$(section_block "$f" '## Verify')"; then echo "ERROR $2: no commands in the fenced block under '## Verify'"; errs=1; fi
  [ -n "$(brief_meta "$f" Risk)" ] || { echo "ERROR $2: header line has no 'Risk: low|med|high'"; errs=1; }
  case $(brief_meta "$f" Oracle) in ''|fail-before|pass-before|none) ;; *) echo "ERROR $2: Oracle must be fail-before, pass-before or none"; errs=1 ;; esac
  awk -v id="$2" '
    /^```/ { code = !code; next }
    !code && /(^|[^A-Za-z])(TBD|as needed|etc\.|handle errors appropriately|add tests|similar to T[0-9])/ { printf "WARN %s: placeholder at line %d: %s\n", id, NR, substr($0, 1, 90) }
  ' "$f"
  [ "$(wc -l < "$f" | tr -d ' ')" -le 150 ] || echo "WARN $2: brief is longer than 150 lines; consider splitting the task"
  if [ "$(brief_meta "$f" Oracle)" != none ] && ! write_set_l "$f" | grep -q "^test$TAB"; then
    echo "WARN $2: no 'test:' entry in the Write-set, so no test will prove this change (set 'Oracle: none' with a reason if that is intended)"
  fi
  return $errs
}

# ---------------------------------------------------------------- oracle (do the tests detect the change?)
# Revert the task's non-test changes to BASE in the working tree only (the index keeps HEAD), keep its
# tests, run Verify, restore. fail-before: Verify must fail without the change. pass-before (refactors,
# characterization tests): Verify must also pass on the old code. Each run records what it reverted in
# <git dir>/orch/oracle.<pid>; a later command restores it if that process is gone.
oracle_restore() {
  local m=$1 d h s p paths
  [ -f "$m" ] || return 0
  d=$(sed -n 1p "$m"); h=$(sed -n 2p "$m")
  if [ "$(git -C "$d" rev-parse HEAD 2>/dev/null)" != "$h" ]; then
    # HEAD moved (a dispatch checkpoint, say). Restoring from HEAD is still exact if those paths didn't change.
    paths=$(sed -n '3,$p' "$m" | cut -f2)
    if printf '%s\n' "$paths" | while IFS= read -r p; do git -C "$d" diff --quiet "$h" HEAD -- "$p" > /dev/null 2>&1 || echo changed; done | grep -q changed; then
      echo "WARNING: an interrupted oracle run left files at their BASE version, and they changed since. Check these by hand:"
      printf '%s\n' "$paths" | sed 's/^/  /'
      rm -f "$m"; return 1
    fi
    h=$(git -C "$d" rev-parse HEAD)
  fi
  sed -n '3,$p' "$m" | while IFS="$TAB" read -r s p; do
    case $s in
      D) git -C "$d" rm -q --cached --ignore-unmatch -- "$p" > /dev/null 2>&1; rm -f "$d/$p" ;;
      *) git -C "$d" checkout -q "$h" -- "$p" ;;
    esac
  done
  rm -f "$m"
}
oracle_recover() {
  local p m pid mins
  p=$(priv "$1") || return 0
  # A live owner is left alone, unless the marker is older than any oracle run can be (the PID was reused).
  mins=$(( (TIMEOUT_S > 0 ? TIMEOUT_S * 2 : 3600) / 60 + 1 ))
  for m in "$p"/oracle "$p"/oracle.*; do
    [ -f "$m" ] || continue
    pid=${m##*/oracle}; pid=${pid#.}
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && [ -z "$(find "$m" -mmin +"$mins" 2>/dev/null)" ]; then continue; fi
    echo "recovered: restored files left at BASE by an interrupted oracle run"
    oracle_restore "$m"
  done
  return 0
}
# oracle_check <dir> <BASE> <brief> <tmpdir> <ID>: uses <tmpdir>/tests (changed test files).
oracle_check() {
  local dir=$1 base=$2 fz=$3 td=$4 id=$5 mode m orc s p
  mode=$(brief_meta "$fz" Oracle); mode=${mode:-fail-before}
  [ "$mode" = none ] && { echo "oracle: skipped (brief says Oracle: none)"; return 0; }
  git -C "$dir" -c core.quotepath=off diff --name-status --no-renames "$base" HEAD -- . ":(exclude)$ORCH" |
    awk -F'\t' -v tf="$td/tests" 'BEGIN { while ((getline l < tf) > 0) t[l] = 1 } !($2 in t)' > "$td/nontests"
  # Nothing but tests changed: Verify on "the old code" is the run that just passed.
  if [ ! -s "$td/nontests" ]; then
    if [ "$mode" = pass-before ]; then echo "oracle pass-before: PASS (only tests changed, and they pass on the existing code)"; return 0; fi
    echo "ORACLE: only tests changed, so the tests pass without any code change (Oracle: fail-before). Characterization tests take 'Oracle: pass-before'; a task with nothing to test takes 'Oracle: none' (orchestrator ruling)."
    return 1
  fi
  [ -s "$td/tests" ] || echo "note: no test file changed; the oracle checks whether existing tests in Verify detect the change"
  m="$(priv "$dir")/oracle.$$"
  { printf '%s\n' "$dir"; git -C "$dir" rev-parse HEAD; cat "$td/nontests"; } > "$m"
  trap 'oracle_restore "$m"; exit 130' INT TERM HUP
  while IFS="$TAB" read -r s p; do
    case $s in
      A) rm -f "$dir/$p" ;;
      D) git -C "$dir" checkout -q "$base" -- "$p" && git -C "$dir" rm -q --cached -- "$p" > /dev/null 2>&1 ;;
      *) git -C "$dir" checkout -q "$base" -- "$p" && git -C "$dir" reset -q -- "$p" > /dev/null 2>&1 ;;
    esac
  done < "$td/nontests"
  run_steps "$(section_block "$fz" '## Verify')" "$dir" "$id-oracle" fast "$td/o.table" > "$td/o.out" 2>&1
  orc=$?
  oracle_restore "$m"; s=$?
  trap - INT TERM HUP
  [ "$s" = 0 ] || return 1
  if [ -n "$(dirty_files "$dir")" ]; then
    echo "ORACLE: the tree is not clean after the oracle run (restored files, or files the tests generate): $(dirty_files "$dir" | head -n 5 | tr '\n' ' ')"; return 1
  fi
  if [ "$mode" = pass-before ]; then
    if [ "$orc" = 0 ]; then echo "oracle pass-before: PASS (the tests pass on the old code too: behavior preserved)"; return 0; fi
    echo "ORACLE: with the code changes reverted to BASE the tests fail, but this task must preserve behavior (Oracle: pass-before). Log: ${LAST_LOG#"$(root)"/}"
    return 1
  fi
  if [ "$orc" != 0 ]; then echo "oracle fail-before: PASS (with the code changes reverted to BASE the tests fail: they detect the change)"; return 0; fi
  echo "ORACLE: with the code changes reverted to BASE the Verify block still passes, so the tests don't detect the change. Make the tests assert the new behavior (or, if the change is not testable, the orchestrator sets 'Oracle: none' with a ruling)."
  return 1
}

# ---------------------------------------------------------------- housekeeping
# Keep run debris out of `git status` without touching the user's files:
# .orchestrator/.gitignore and .gitattributes (committed with the run) and the repo-local exclude file.
ensure_excludes() {
  if [ -d "$1/$ORCH" ]; then
    grep -qxF 'logs/' "$1/$ORCH/.gitignore" 2>/dev/null || printf 'logs/\n' >> "$1/$ORCH/.gitignore"
    # Run state is parsed by awk and shared across machines: keep LF everywhere.
    [ -f "$1/$ORCH/.gitattributes" ] || printf '* text eol=lf\n' > "$1/$ORCH/.gitattributes"
  fi
  ex=$(git -C "$1" rev-parse --git-path info/exclude 2>/dev/null) || return 0
  case $ex in /*|[A-Za-z]:*) ;; *) ex="$1/$ex" ;; esac
  if ! grep -qxF '/.claude/worktrees/' "$ex" 2>/dev/null; then
    mkdir -p "$(dirname "$ex")" && printf '/.claude/worktrees/\n' >> "$ex"
  fi
  return 0
}

sed_escape() { printf '%s' "$1" | sed 's/[&|\\]/\\&/g'; }

# Move run files out of the working tree into the private archive (<git dir>/orch/<kind>/...).
stash_run() {  # <root> <kind> <run name> → prints the archive path
  local d="$1/$ORCH" arch f
  arch="$(priv "$1")/$2/${3:-run}-$(date -u +%Y%m%d%H%M%S)"
  mkdir -p "$arch"
  for f in PLAN.md STATE.md LEDGER.md tasks reports recon baseline archive; do
    if [ -e "$d/$f" ]; then cp -R "$d/$f" "$arch/" && rm -rf "${d:?}/$f"; fi
  done
  printf '%s\n' "$arch"
}

# ---------------------------------------------------------------- commands
cmd_init() {
  local slug=${1:-} r d br sha short t owner old ob st arch
  [ -n "$slug" ] || die "usage: init <slug>"
  case $slug in
    *[!a-z0-9-]*|-*|*-) die "slug must use lowercase letters, digits and inner hyphens" ;;
  esac
  r=$(root) || exit 2; d="$r/$ORCH"
  git -C "$r" rev-parse -q --verify HEAD > /dev/null || die "repository has no commits; make an initial commit first"
  br=$(git -C "$r" rev-parse --abbrev-ref HEAD)
  if [ -f "$d/STATE.md" ]; then
    old=$(st_get "$d/STATE.md" run); ob=$(st_get "$d/STATE.md" branch); st=$(st_get "$d/STATE.md" status)
    if [ "$st" = done ]; then
      arch=$(stash_run "$r" archive "$old")
      echo "archived finished run '$old' to ${arch#"$r"/} (it also stays in git history)"
    elif [ -n "$ob" ] && [ "$ob" != "$br" ]; then
      arch=$(stash_run "$r" foreign "$old")
      echo "WARNING: $ORCH/ held unfinished run '$old' of branch '$ob' (owner: $(st_get "$arch/STATE.md" owner)), not of '$br'."
      echo "  It was merged here by mistake. Moved aside to ${arch#"$r"/}; your next checkpoint removes it from this branch."
    else
      die "an unfinished run exists ($ORCH/STATE.md, branch $ob). Resume it, or finish it first: orch.sh finish --force"
    fi
  fi
  mkdir -p "$d/tasks" "$d/reports" "$d/recon" "$d/logs"
  ensure_excludes "$r"
  sha=$(git -C "$r" rev-parse HEAD)
  short=$(git -C "$r" rev-parse --short HEAD)
  owner=$(git -C "$r" config user.email 2>/dev/null || git -C "$r" config user.name 2>/dev/null || echo unknown)
  t=$(now)
  for f in STATE.md PLAN.md; do
    sed -e "s|<slug>|$slug|g" -e "s|<branch>|$(sed_escape "$br")|g" -e "s|<sha>|$sha|g" -e "s|<UTC time>|$t|g" \
      -e "s|<owner>|$(sed_escape "$owner")|g" "$SKILL_DIR/assets/$f" > "$d/$f"
  done
  {
    echo "# LEDGER (append-only, one line per event)"
    echo "<!-- format: - <UTC time> <event>. Rulings: \"Ruling: <decision> — <why> — <cost if wrong>\" -->"
    echo "- $t init run=$slug branch=$br base=$short owner=$owner"
  } > "$d/LEDGER.md"
  case $br in
    main|master|trunk|develop|HEAD) echo "WARNING: on '$br'. Work on a feature branch: git switch -c orch/$slug" ;;
  esac
  nd=$(dirty_files "$r" | wc -l | tr -d ' ')
  if [ "$nd" != 0 ]; then
    echo "WARNING: $nd uncommitted path(s) outside $ORCH/, e.g. $(dirty_files "$r" | head -n 3 | tr '\n' ' ')"
    echo "  Gates count these as DIRTY. Commit them (the kit files too) before dispatching; ask the user about their own work."
  fi
  echo "initialized $ORCH/ for run '$slug' on $br@$short"
  echo "next: fill PLAN.md 'Verify (global)' and 'Verify (per task)', then run: orch.sh baseline"
}

cmd_status() {
  local r st br cur bs
  r=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "orch: not inside a git repository"; return 0; }
  oracle_recover "$r"
  st="$r/$ORCH/STATE.md"
  if [ -f "$st" ]; then
    br=$(st_get "$st" branch); cur=$(git -C "$r" rev-parse --abbrev-ref HEAD 2>/dev/null)
    if [ -n "$br" ] && [ "$br" != "$cur" ] && [ "$(st_get "$st" status)" != done ]; then
      echo "FOREIGN RUN: $ORCH/STATE.md belongs to branch '$br' (owner: $(st_get "$st" owner)), not '$cur'. It is not active here."
      echo "  Ignore it; 'orch.sh init <slug>' moves it aside when you start your own run."
    fi
    awk -f <(printf '%s' '
      { sub(/\r$/, "") }
      /^(run|owner|branch|run-base|status|updated):/ { print; next }
      /^## NEXT ACTION/ { na = 1; print; next }
      /^## / { na = 0; tasks = ($0 ~ /^## Tasks/); next }
      na && NF { print }
      tasks && /^- \[/ {
        k = substr($0, 4, 1); c[k]++
        if (k != "x") open = open "\n  " $0
      }
      END {
        printf "tasks: %d done, %d in progress, %d todo, %d blocked, %d dropped\n", c["x"], c["~"], c[" "], c["!"], c["-"]
        if (open != "") print "open:" open
      }
    ') "$st"
    if [ -f "$r/$ORCH/baseline/global.steps" ]; then
      bs=$(awk -F'\t' '{ n++; if ($2 != 0) f++ } END { printf "%d step(s), %d failing", n, f }' "$r/$ORCH/baseline/global.steps")
      echo "baseline: $bs (at $(short "$r" "$(cat "$r/$ORCH/baseline/sha" 2>/dev/null)"))"
    else
      echo "baseline: not recorded (run: orch.sh baseline)"
    fi
  else
    echo "NO ACTIVE RUN (no $ORCH/STATE.md)"
  fi
  printf 'git: %s @ %s · uncommitted outside %s: %s · extra worktrees: %s\n' \
    "$(git -C "$r" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')" \
    "$(git -C "$r" rev-parse --short HEAD 2>/dev/null || echo none)" \
    "$ORCH/" \
    "$(dirty_files "$r" | wc -l | tr -d ' ')" \
    "$(($(git -C "$r" worktree list | wc -l) - 1))"
  return 0
}

cmd_checkpoint() {
  local msg=${*:-bookkeeping} r out new
  r=$(root) || exit 2
  [ -d "$r/$ORCH" ] || die "no $ORCH/ directory; run init first"
  git -C "$r" add -A -- "$ORCH" || die "git add failed"
  # --no-verify: bookkeeping-only commits must not be blocked or rewritten by project hooks.
  if ! git -C "$r" diff --cached --quiet -- "$ORCH"; then
    out=$(git -C "$r" commit -q --no-verify -m "chore(orch): $msg" -- "$ORCH" 2>&1) || die "git commit failed: $out"
    ckpt_record "$r" "$(git -C "$r" rev-parse HEAD)"
  else
    case $msg in
      dispatch\ *)
        # An empty commit without touching the index, so BASE is always findable with `orch.sh base`.
        new=$(git -C "$r" commit-tree "HEAD^{tree}" -p HEAD -m "chore(orch): $msg") || die "git commit-tree failed"
        git -C "$r" update-ref -m "orch: $msg" HEAD "$new" "$(git -C "$r" rev-parse HEAD)" || die "git update-ref failed"
        ckpt_record "$r" "$new"
        ;;
    esac
  fi
  git -C "$r" rev-parse HEAD
}

cmd_base() {
  local id=${1:-} r st b subj range rbase shas sha
  [ -n "$id" ] || die "usage: base <TASK_ID>"
  r=$(root) || exit 2; st="$r/$ORCH/STATE.md"
  # 1. The base recorded on the task line, if it is a dispatch checkpoint that names this task.
  if [ -f "$st" ]; then
    b=$(task_meta "$(task_line "$st" "$id")" base)
    if [ -n "$b" ] && [ "$b" != PENDING ] && git -C "$r" rev-parse -q --verify "$b^{commit}" > /dev/null; then
      subj=$(git -C "$r" log -1 --format=%s "$b")
      case "$subj " in "chore(orch): dispatch"*" $id "*) git -C "$r" rev-parse "$b^{commit}"; return 0 ;; esac
    fi
  fi
  # 2. Otherwise the newest dispatch checkpoint of this run that names the task (task IDs repeat across runs),
  #    preferring checkpoints this clone recorded itself.
  range=HEAD
  rbase=$(st_get "$st" run-base 2>/dev/null)
  if [ -n "$rbase" ] && git -C "$r" rev-parse -q --verify "$rbase^{commit}" > /dev/null; then range="$rbase..HEAD"; fi
  shas=$(git -C "$r" log --format='%H %s' --basic-regexp --grep='^chore(orch): dispatch ' "$range" | awk -v id="$id" '
    { for (i = 4; i <= NF; i++) if ($i == id) { print $1; break } }')
  [ -n "$shas" ] || die "no 'dispatch' checkpoint names $id"
  for sha in $shas; do if ckpt_known "$r" "$sha"; then echo "$sha"; return 0; fi; done
  printf '%s\n' "$shas" | head -n 1
}

cmd_baseline() {
  local r tmp_before tmp_after new rc blk tbl
  r=$(root) || exit 2
  [ -f "$r/$ORCH/PLAN.md" ] || die "missing $ORCH/PLAN.md; run init and fill 'Verify (global)' first"
  oracle_recover "$r"
  tmp_before=$(tmpf); tmp_after=$(tmpf); tbl=$(tmpf)
  dirty_files "$r" | LC_ALL=C sort -u > "$tmp_before"
  blk=$(plan_block global)
  has_cmds "$blk" || die "no commands in PLAN.md 'Verify (global)'"
  run_steps "$blk" "$r" baseline all "$tbl"; rc=$?
  save_baseline global "$tbl" "$LAST_LOG" "$r" "$LAST_NONCE"
  blk=$(plan_block pertask)
  if has_cmds "$blk"; then
    echo "== per-task checks"
    run_steps "$blk" "$r" baseline-pertask all "$tbl"
    save_baseline pertask "$tbl" "$LAST_LOG" "$r" "$LAST_NONCE"
  fi
  dirty_files "$r" | LC_ALL=C sort -u > "$tmp_after"
  new=$(LC_ALL=C comm -13 "$tmp_before" "$tmp_after")
  rm -f "$tmp_before" "$tmp_after" "$tbl"
  echo "baseline exit $rc: per-step results saved in $ORCH/baseline/ (failing steps are pre-existing, not ours); note them in STATE.md > Baseline"
  if [ -n "$new" ]; then
    echo "NOTE: the verify commands created or changed these paths, which every gate would count as DIRTY:"
    printf '%s\n' "$new" | head -n 10 | sed 's/^/  /'
    echo "  Ignore generated output locally: append patterns to $(git -C "$r" rev-parse --git-path info/exclude); restore changed tracked files."
  fi
  return 0
}

cmd_verify_all() {
  local r blk tbl rc
  r=$(root) || exit 2
  [ -f "$r/$ORCH/PLAN.md" ] || die "missing $ORCH/PLAN.md"
  blk=$(plan_block global)
  has_cmds "$blk" || die "no commands in PLAN.md 'Verify (global)'"
  tbl="$r/$ORCH/logs/verify-all.last"; mkdir -p "$r/$ORCH/logs"
  run_steps "$blk" "$r" verify-all all "$tbl"; rc=$?
  [ "$rc" = 0 ] && { echo "VERIFY-ALL: PASS (every step passed)"; return 0; }
  if regressions global "$tbl" "$LAST_LOG" "$r" "$LAST_NONCE"; then
    echo "VERIFY-ALL: PASS (no regressions; every failure was there at the baseline)"; return 0
  fi
  echo "VERIFY-ALL: FAIL (regressions above; a flaky test? re-run once, and log 'flaky:' in LEDGER if the result flips)"
  return 1
}

cmd_verify() {
  local id=${1:-} r b td rc
  [ -n "$id" ] || die "usage: verify <TASK_ID> [dir]"
  r=$(root) || exit 2
  [ -f "$r/$ORCH/tasks/$id.md" ] || die "brief not found: $ORCH/tasks/$id.md"
  td=$(tmpdir); b="$td/brief.md"
  frozen_brief "$r" "$id" "$b" || cp "$r/$ORCH/tasks/$id.md" "$b"
  run_block "$b" "## Verify" "${2:-$r}" "$id-verify" fast "$td/table"; rc=$?
  if [ "$rc" = 0 ] && ! zero_tests "$LAST_LOG"; then echo "NO-TESTS: a test runner reported zero tests; the filter or path matches nothing"; rc=1; fi
  rm -rf "$td"
  return "$rc"
}

cmd_dispatch() {
  local wt=0 ids="" a id r st f line pb pmode pat attempt reuse sha base model risk errs=0 slug b10
  for a in "$@"; do case $a in --worktree) wt=1 ;; -*) die "unknown option: $a" ;; *) ids="$ids $a" ;; esac; done
  [ -n "$ids" ] || die "usage: dispatch [--worktree] <ID>..."
  r=$(root) || exit 2; st="$r/$ORCH/STATE.md"
  [ -f "$st" ] || die "no run here (missing $ORCH/STATE.md)"
  for id in $ids; do
    f="$r/$ORCH/tasks/$id.md"
    if [ ! -f "$f" ]; then echo "ERROR $id: brief not found ($ORCH/tasks/$id.md)"; errs=1; continue; fi
    lint_brief "$f" "$id" || errs=1
    case $(task_line "$st" "$id") in "- [x] "*) echo "ERROR $id: already done ([x]); finished tasks are never redone"; errs=1 ;; esac
  done
  [ "$errs" = 0 ] || die "dispatch refused: fix the brief errors above"
  for id in $ids; do
    line=$(task_line "$st" "$id")
    pb=$(task_meta "$line" base); pmode=$(task_meta "$line" mode); pat=$(task_meta "$line" attempt)
    attempt=1; reuse=""
    if [ -n "$pb" ] && [ "$pb" != PENDING ]; then
      attempt=$((${pat:-1} + 1))
      # Same checkout as before: keep the old BASE so the gate sees the partial work too, but only if
      # everything changed since then is this task's (other tasks done in between would count as its own).
      if [ "$wt" = 0 ] && [ "$pmode" != worktree ] && git -C "$r" rev-parse -q --verify "$pb^{commit}" > /dev/null &&
         git -C "$r" merge-base --is-ancestor "$pb" HEAD; then
        wsf=$(tmpf); write_set "$r/$ORCH/tasks/$id.md" > "$wsf"
        # Every product commit since then must be this task's ("... ($id)" by the executor's convention).
        if [ -z "$(git -C "$r" log --format=%s --basic-regexp --grep='^chore(orch): ' --invert-grep "$pb..HEAD" | grep -vF "($id)")" ] &&
           [ -z "$(git -C "$r" -c core.quotepath=off diff --name-only --no-renames "$pb" HEAD -- . ":(exclude)$ORCH" | out_of_scope "$wsf")" ]; then
          reuse=$(git -C "$r" rev-parse "$pb^{commit}")
        fi
        rm -f "$wsf"
      fi
    fi
    eval "AT_$id=\$attempt; RU_$id=\$reuse" 2>/dev/null || die "task IDs must be letters, digits and underscores: $id"
    state_task "$st" "$id" "~" "base=${reuse:-PENDING} attempt=$attempt$([ "$wt" = 1 ] && echo ' mode=worktree')" 0 "$(brief_title "$r/$ORCH/tasks/$id.md")"
  done
  state_status "$st" executing '^(recon|planning|awaiting-approval)$'
  ledger "dispatch$ids$([ "$wt" = 1 ] && echo ' (worktree wave)')"
  sha=$(cmd_checkpoint "dispatch$ids") || exit 2
  slug=$(st_get "$st" run)
  echo "BASE=$sha"
  for id in $ids; do
    eval "attempt=\$AT_$id; reuse=\$RU_$id"
    base=${reuse:-$sha}; b10=$(printf '%.10s' "$base")
    state_task "$st" "$id" "~" "base=$b10 attempt=$attempt$([ "$wt" = 1 ] && echo ' mode=worktree')" 0
    f="$r/$ORCH/tasks/$id.md"
    model=$(brief_meta "$f" Model); risk=$(brief_meta "$f" Risk)
    echo "== $id · agent orch-executor · model ${model:-sonnet} · risk ${risk:-?} · attempt $attempt$([ "$wt" = 1 ] && echo ' · isolation: "worktree"') · prompt:"
    echo "Task $id of run $slug. Brief: $ORCH/tasks/$id.md"
    echo "BASE=$base  REPORT=$ORCH/reports/$id.md"
    if [ "$attempt" -gt 1 ]; then
      echo "Attempt $attempt: read REPORT for what was tried.$([ -n "$reuse" ] && echo ' Partial work may exist: inspect git status and git diff BASE first and finish it; do not start over.')"
    fi
  done
}

cmd_gate() {
  local id="" base="" dir="" agent="" check=0 r rp td brief fz fp commits nfiles brisk tier fails="" line mode b7 h7 hd wtarg=""
  [ $# -gt 0 ] || die "usage: gate <ID> [BASE] [dir] [--agent <id>] [--check]"
  id=$1; shift
  while [ $# -gt 0 ]; do
    case $1 in
      --agent) agent=${2:-}; [ $# -gt 1 ] && shift ;;
      --check) check=1 ;;
      -*) die "unknown option: $1" ;;
      *) if [ -d "$1" ]; then dir=$1; elif [ -z "$base" ]; then base=$1; else die "unexpected argument: $1"; fi ;;
    esac
    shift
  done
  r=$(root) || exit 2
  dir=${dir:-$r}
  [ -d "$dir" ] || die "directory not found: $dir"
  # Compare checkouts in git's own path form: pwd output differs between Windows mount aliases.
  dir=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || die "not a git checkout: $dir"
  rp=$r
  [ "$dir" = "$rp" ] || wtarg=" $dir"
  oracle_recover "$dir"
  brief="$r/$ORCH/tasks/$id.md"
  [ -f "$brief" ] || die "brief not found: $ORCH/tasks/$id.md (if HEAD moved, see: git reflog -5)"
  td=$(tmpdir); fz="$td/brief.md"; fp="$td/plan.md"
  if [ -z "$base" ]; then base=$(cmd_base "$id") || { rm -rf "$td"; exit 2; }; fi
  git -C "$dir" rev-parse -q --verify "$base^{commit}" > /dev/null || { rm -rf "$td"; die "BASE $base not found in $dir"; }
  base=$(git -C "$dir" rev-parse "$base^{commit}")
  frozen_brief "$r" "$id" "$fz" "$base" || { rm -rf "$td"; die "brief $id was never committed by orch.sh; dispatch it with: orch.sh dispatch $id"; }
  # The plan as committed (an executor's commit to it is TAMPER below; an uncommitted edit is PLAN-DRIFT).
  git -C "$r" show "HEAD:$ORCH/PLAN.md" > "$fp" 2>/dev/null || cp "$r/$ORCH/PLAN.md" "$fp" 2>/dev/null || : > "$fp"
  [ "$dir" = "$rp" ] || ensure_excludes "$dir"
  b7=$(short "$dir" "$base"); h7=$(short "$dir" HEAD); hd=$(git -C "$dir" rev-parse HEAD)

  write_set_l "$fz" > "$td/wsl"; cut -f2 "$td/wsl" > "$td/ws"
  [ -s "$td/ws" ] || { rm -rf "$td"; die "no paths under '## Write-set' in the committed brief $id"; }
  dirty_files "$dir" > "$td/dirty"
  { git -C "$dir" -c core.quotepath=off diff --name-only --no-renames "$base" HEAD -- . ":(exclude)$ORCH"; cat "$td/dirty"; } |
    sed 's/^"\(.*\)"$/\1/' | LC_ALL=C sort -u > "$td/changed"
  out_of_scope "$td/ws" < "$td/changed" > "$td/extra"
  # Changed test files: labeled "test:" in the write-set, or named like tests.
  awk -F'\t' '$1 == "test" { print $2 }' "$td/wsl" > "$td/wstests"
  out_of_scope "$td/wstests" < "$td/changed" | LC_ALL=C sort > "$td/notlabeled"
  LC_ALL=C comm -23 "$td/changed" "$td/notlabeled" > "$td/tests"
  grep -E -- "$TEST_PATH_RE" "$td/notlabeled" >> "$td/tests" 2>/dev/null
  LC_ALL=C sort -u -o "$td/tests" "$td/tests"
  commits=$(git -C "$dir" rev-list --count "$base..HEAD")
  nfiles=$(wc -l < "$td/changed" | tr -d ' ')
  brisk=$(brief_meta "$fz" Risk)
  risk_hits "$r" < "$td/changed" > "$td/riskhits"
  tier=${brisk:-low}; [ -s "$td/riskhits" ] && tier=high
  echo "== gate $id · base $b7 · head $h7 · commits $commits · files $nfiles · risk $tier$([ "$check" = 1 ] && echo ' · check only')"

  if ! git -C "$dir" merge-base --is-ancestor "$base" HEAD; then
    echo "HISTORY: BASE is not an ancestor of HEAD (history rewritten or HEAD moved)"; fails="$fails history"
  fi
  if [ "$dir" = "$rp" ]; then
    want=$(st_get "$r/$ORCH/STATE.md" branch 2>/dev/null)
    cur=$(git -C "$r" rev-parse --abbrev-ref HEAD)
    if [ -n "$want" ] && [ "$want" != "$cur" ]; then
      echo "BRANCH: checkout is on '$cur' but the run branch is '$want'"; fails="$fails branch"
    fi
  fi
  spec_of "$fz" > "$td/spec.f"; spec_of "$brief" > "$td/spec.w"
  if ! cmp -s "$td/spec.f" "$td/spec.w"; then
    echo "SPEC-DRIFT: the working copy of $ORCH/tasks/$id.md differs from the committed brief in its Risk/Oracle, Write-set, Test cases or Verify."
    echo "  The gate uses the committed brief. Orchestrator: if you made this change, run 'orch.sh checkpoint \"ruling $id\"' and re-run the gate."
    fails="$fails spec-drift"
  fi
  { plan_block global "$fp"; echo "##"; plan_block pertask "$fp"; } > "$td/pv.f"
  { plan_block global; echo "##"; plan_block pertask; } > "$td/pv.w" 2>/dev/null
  if ! cmp -s "$td/pv.f" "$td/pv.w"; then
    echo "PLAN-DRIFT: the working copy of $ORCH/PLAN.md changed its Verify blocks since the last checkpoint. Orchestrator: if you made this change, checkpoint and re-run the gate."
    fails="$fails plan-drift"
  fi
  if [ -n "$(git -C "$r" status --porcelain -- "$ORCH/baseline" 2>/dev/null)" ]; then
    echo "BASELINE-DRIFT: $ORCH/baseline/ has uncommitted changes. Orchestrator: if you re-ran the baseline, checkpoint and re-run the gate."
    fails="$fails baseline-drift"
  fi
  if [ -s "$td/extra" ]; then echo "SCOPE: changed outside the write-set: $(tr '\n' ' ' < "$td/extra")"; fails="$fails scope"; fi
  # Tamper: a non-orchestrator commit that changed the plan, a brief, the state, the baseline or a review;
  # a commit that claims to be a checkpoint but changes product files, or that this clone never made.
  tm=$(git -C "$dir" log --format='%h %s' "$base..HEAD" -- "$ORCH/tasks" "$ORCH/PLAN.md" "$ORCH/STATE.md" "$ORCH/baseline" "$ORCH/reports/*review*" | grep -v '^[0-9a-f]* chore(orch): ' | tr '\n' ';')
  for c in $(git -C "$dir" log --format=%H --basic-regexp --grep='^chore(orch): ' "$base..HEAD"); do
    if [ -n "$(git -C "$dir" diff-tree --no-commit-id --name-only -r "$c" -- . ":(exclude)$ORCH" 2>/dev/null)" ]; then
      tm="$tm $(short "$dir" "$c") (a checkpoint commit that changes product files);"
    elif ckpt_known "$dir" "$base" && ! ckpt_known "$dir" "$c"; then
      tm="$tm $(short "$dir" "$c") (a checkpoint commit orch.sh did not make);"
    fi
  done
  if [ -n "$tm" ]; then echo "TAMPER: $tm"; fails="$fails tamper"; fi
  nd=$(wc -l < "$td/dirty" | tr -d ' ')
  if [ "$nd" != 0 ]; then echo "DIRTY: $nd uncommitted path(s) outside $ORCH/; the executor must commit its work: $(head -n 5 "$td/dirty" | tr '\n' ' ')"; fails="$fails dirty"; fi
  if [ "$commits" = 0 ]; then echo "WARN: no commits since BASE"; fi

  added_lines "$dir" "$base" all > "$td/added"
  secret_scan "$r" < "$td/added" > "$td/secrets"
  if [ -s "$td/secrets" ]; then
    echo "SECRET: credential-like value(s) added (values not shown): $(head -n 8 "$td/secrets" | tr '\n' ' ')"
    echo "  Use config or env vars instead. A deliberate fake value can be marked with an 'orch-allow-secret' comment on its line."
    fails="$fails secret"
  fi
  if command -v gitleaks > /dev/null 2>&1; then
    gitleaks git --log-opts="$base..HEAD" --redact --no-banner "$dir" > "$td/gitleaks" 2>&1
    if grep -q 'Finding:' "$td/gitleaks"; then echo "SECRET (gitleaks): $(grep -c 'Finding:' "$td/gitleaks") finding(s); run: gitleaks git --log-opts=$base..HEAD --redact"; fails="$fails secret"; fi
  fi
  # Tests without assertions: a new test file (one that defines tests, or a shell test script) with none
  # fails; changed tests with no new assertion warn. Fixtures and helpers define no tests and are skipped.
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    case $(git -C "$dir" diff --name-status --no-renames "$base" HEAD -- "$f" | cut -f1) in
      A) git -C "$dir" show "HEAD:$f" > "$td/tfile" 2>/dev/null
         case $f in *.sh|*.bats) isdef=1 ;; *) isdef=0; grep -Eq -- "$TESTDEF_RE" "$td/tfile" && isdef=1 ;; esac
         if [ "$isdef" = 1 ] && ! grep -Eiq -- "$ASSERT_RE" "$td/tfile"; then
           echo "NO-ASSERT: new test file $f contains no assertion, so it cannot fail"; fails="$fails no-assert"; fi ;;
      M) awk -F'\t' -v f="$f" '$1 == f { sub(/^[^\t]*\t[^\t]*\t/, ""); print }' "$td/added" > "$td/tadd"
         if [ -s "$td/tadd" ] && grep -Eq -- "$TESTDEF_RE" "$td/tadd" && ! grep -Eiq -- "$ASSERT_RE" "$td/tadd"; then
           echo "WARN: $f gained test code but no assertion line"; fi ;;
    esac
  done < "$td/tests"
  awk -F'\t' -v o="$ORCH/" 'index($1, o) != 1' "$td/added" | slop_scan "$dir" "$base" 8 > "$td/slop"
  case $(tail -n 1 "$td/slop") in "slop: 0 finding"*) ;; *) sed 's/^/WARN /' "$td/slop" ;; esac
  if grep -E -- "$MANIFEST_RE" "$td/changed" > "$td/manifests" 2>/dev/null; then
    echo "WARN deps: dependency manifest(s) changed: $(tr '\n' ' ' < "$td/manifests"). Confirm every added package exists, is the intended one, and is pinned."
  fi
  if [ -s "$td/riskhits" ] && [ "${brisk:-low}" != high ]; then
    echo "RISK: high (the brief says ${brisk:-nothing}); high-risk paths: $(head -n 6 "$td/riskhits" | tr '\n' ' ')"
  fi

  # Verify (the committed brief's block), then the plan's per-task checks, then the oracle.
  if run_block "$fz" "## Verify" "$dir" "$id" fast "$td/v.table"; then
    if ! zero_tests "$LAST_LOG"; then
      echo "NO-TESTS: a test runner reported zero tests and none ran; the test filter or path matches nothing"; fails="$fails no-tests"
    fi
    grep -o '`test: [^`]*`' "$fz" | sed 's/^`test: //; s/`$//' > "$td/names" 2>/dev/null
    grep -v "^@@orch-$LAST_NONCE step " "$LAST_LOG" > "$td/vout"
    while IFS= read -r tn; do
      [ -n "$tn" ] || continue
      if ! grep -Fq -- "$tn" "$td/vout"; then echo "MISSING-TEST: '$tn' does not appear in the Verify output (name the test exactly, and use verbose test output)"; fails="$fails missing-test"; fi
    done < "$td/names"
    pt=$(plan_block pertask "$fp")
    if [ -z "$fails" ] && has_cmds "$pt"; then
      echo "== per-task checks (PLAN 'Verify (per task)')"
      if ! run_steps "$pt" "$dir" "$id-pertask" all "$td/p.table"; then
        if ! regressions pertask "$td/p.table" "$LAST_LOG" "$dir" "$LAST_NONCE"; then fails="$fails collateral"; fi
      fi
    fi
  else
    fails="$fails verify"
  fi
  # Running the checks must not change the code: a test that rewrites product files proves nothing.
  if [ "$(dirty_files "$dir")" != "$(cat "$td/dirty")" ]; then
    echo "DIRTY: running Verify changed or created files: $(dirty_files "$dir" | head -n 5 | tr '\n' ' ') (generated output belongs in .gitignore or .git/info/exclude)"
    fails="$fails dirty-after-verify"
  fi
  if [ -z "$fails" ]; then
    oracle_check "$dir" "$base" "$fz" "$td" "$id" || fails="$fails oracle"
  fi

  st="$r/$ORCH/STATE.md"
  if [ -n "$fails" ]; then
    echo "GATE $id: FAIL ($(printf '%s' "${fails# }" | tr ' ' ','))"
    if [ "$check" = 0 ] && [ -f "$st" ]; then
      state_task "$st" "$id" "~" "gate=FAIL$([ -n "$agent" ] && echo " agent=$agent")" 1
      ledger "gate $id FAIL (${fails# }) head=$h7"
    fi
    rm -rf "$td"; return 1
  fi
  if [ "$check" = 1 ]; then
    echo "GATE $id: PASS (check only: the orchestrator's own gate decides)"
    [ "$tier" = high ] && echo "note: high risk, so a review follows"
    rm -rf "$td"; return 0
  fi
  echo "GATE $id: PASS"
  [ -f "$st" ] || { rm -rf "$td"; return 0; }
  line=$(task_line "$st" "$id"); mode=$(task_meta "$line" mode)
  if [ "$tier" = high ]; then
    # A one-time request token, given only to the reviewer: a review file counts only if it carries it,
    # so nothing written before this request (or by the executor) can approve the task.
    rq="$$${RANDOM}${RANDOM}$(date +%s)"
    printf '%s\n' "$rq" > "$(priv "$r")/review-$id"
    state_task "$st" "$id" "~" "gate=PASS@$(printf '%.10s' "$hd") review=pending$([ -n "$wtarg" ] || [ "$mode" = worktree ] && echo ' merge=pending')$([ -n "$agent" ] && echo " agent=$agent")" 1
    ledger "gate $id PASS head=$h7 (high risk: review required)"
    echo "NEXT: high risk. Dispatch orch-reviewer (model sonnet) with: Mode: task. Brief: $ORCH/tasks/$id.md BASE=$base${wtarg:+ DIR=\"$dir\"} REQUEST=$rq OUT=$ORCH/reports/$id-review.md"
    echo "  (a re-review after a fix: Mode: rereview with the same REQUEST and OUT=$ORCH/reports/$id-rereview.md)"
    echo "  then run: orch.sh review $id${wtarg:+ \"$dir\"}"
    rm -rf "$td"; return 4
  fi
  if [ -n "$wtarg" ] || [ "$mode" = worktree ]; then
    state_task "$st" "$id" "~" "gate=PASS@$(printf '%.10s' "$hd") merge=pending$([ -n "$agent" ] && echo " agent=$agent")" 1
    ledger "gate $id PASS head=$h7 in worktree (merge pending)"
    echo "NEXT: orch.sh merge $id \"$dir\""
  else
    state_task "$st" "$id" "x" "done $b7..$h7 (gate PASS)" 0
    ledger "gate $id PASS $b7..$h7"
    echo "state: $id marked [x] ($b7..$h7)"
  fi
  rm -rf "$td"; return 0
}

# review_ok <root> <ID> <dir>: a review file answers the gate's latest request (carries its REQUEST
# token) and approves code identical to the current HEAD of <dir> (the run checkout, or the task's worktree).
review_ok() {
  local r=$1 id=$2 d=$3 f="" c v rh mk rq
  mk="$(priv "$r")/review-$id"
  [ -f "$mk" ] || { echo "no review was requested for $id; run: orch.sh gate $id"; return 1; }
  rq=$(sed -n 1p "$mk")
  for c in "$r/$ORCH/reports/$id-rereview.md" "$r/$ORCH/reports/$id-review.md"; do
    if [ -f "$c" ] && awk -v want="REQUEST: $rq" '{ sub(/\r$/, ""); sub(/[ \t]+$/, "") } $0 == want { f = 1 } END { exit !f }' "$c"; then f=$c; break; fi
  done
  [ -n "$f" ] || { echo "no review file answers the latest request: it must contain the line 'REQUEST: $rq' (dispatch orch-reviewer with the gate's prompt)"; return 1; }
  v=$(awk '/^VERDICT:/ { print $2; exit }' "$f"); rh=$(awk '/^HEAD:/ { print $2; exit }' "$f")
  if [ -z "$rh" ] || ! git -C "$d" rev-parse -q --verify "$rh^{commit}" > /dev/null; then echo "review ${f#"$r"/} has no valid 'HEAD: <sha>' line"; return 1; fi
  if ! git -C "$d" diff --quiet "$rh" HEAD -- . ":(exclude)$ORCH" 2>/dev/null; then echo "review ${f#"$r"/} is stale: the code changed after it (reviewed $rh)"; return 1; fi
  [ "$v" = APPROVE ] || { echo "review ${f#"$r"/} says ${v:-no verdict}"; return 1; }
  echo "review ${f#"$r"/}: APPROVE"
}

# The checkout a task's code lives in: dir $2 if given (a worktree), else the run checkout.
task_dir() {
  if [ -n "${2:-}" ]; then [ -d "$2" ] || die "directory not found: $2"; git -C "$2" rev-parse --show-toplevel 2>/dev/null || die "not a git checkout: $2"
  else root; fi
}

cmd_review() {
  local id=${1:-} r d st line g gs b7
  [ -n "$id" ] || die "usage: review <ID> [worktree-dir]"
  r=$(root) || exit 2; st="$r/$ORCH/STATE.md"; d=$(task_dir "$r" "${2:-}") || exit 2
  line=$(task_line "$st" "$id"); g=$(task_meta "$line" gate)
  case $g in PASS@*) gs=${g#PASS@} ;; *) die "the gate has not passed for $id; run: orch.sh gate $id" ;; esac
  git -C "$d" diff --quiet "$gs" HEAD -- . ":(exclude)$ORCH" 2>/dev/null || die "code changed since the gate passed (or the worktree dir is missing); re-run: orch.sh gate $id"
  if review_ok "$r" "$id" "$d"; then
    b7=$(short "$r" "$(task_meta "$line" base)")
    if [ "$(task_meta "$line" mode)" = worktree ] || [ "$d" != "$r" ]; then
      state_task "$st" "$id" "~" "review=APPROVE merge=pending" 1; ledger "review $id APPROVE"
      echo "next: orch.sh merge $id \"$d\""
    else
      state_task "$st" "$id" "x" "done $b7..$(short "$r" HEAD) (gate PASS, review APPROVE)" 0; ledger "review $id APPROVE: done"
      echo "state: $id marked [x]"
    fi
    return 0
  fi
  state_task "$st" "$id" "~" "review=changes" 1
  ledger "review $id: not approved"
  echo "fix loop: resume the executor with the findings file path (Critical and Important findings), gate again, then a rereview into $ORCH/reports/$id-rereview.md"
  return 1
}

cmd_accept() {
  local id=${1:-} r d st line g gs dd=""
  [ -n "$id" ] && [ $# -ge 2 ] || die "usage: accept <ID> [worktree-dir] <ruling: decision — why — cost if wrong>"
  shift
  if [ $# -ge 2 ] && [ -d "$1" ]; then dd=$1; shift; fi
  r=$(root) || exit 2; st="$r/$ORCH/STATE.md"; d=$(task_dir "$r" "$dd") || exit 2
  line=$(task_line "$st" "$id"); g=$(task_meta "$line" gate)
  case $g in PASS@*) gs=${g#PASS@} ;; *) die "only a task whose gate passed can be accepted; run: orch.sh gate $id" ;; esac
  git -C "$d" diff --quiet "$gs" HEAD -- . ":(exclude)$ORCH" 2>/dev/null || die "code changed since the gate passed; re-run: orch.sh gate $id"
  if [ "$(task_meta "$line" mode)" = worktree ] || [ "$d" != "$r" ]; then
    state_task "$st" "$id" "~" "review=accepted merge=pending" 1
    ledger "Ruling: $id accepted with open findings: $*"
    echo "ruling logged; next: orch.sh merge $id \"$d\""; return 0
  fi
  state_task "$st" "$id" "x" "done $(short "$r" "$(task_meta "$line" base)")..$(short "$r" HEAD) (gate PASS, accepted by ruling)" 0
  ledger "Ruling: $id accepted with open findings: $*"
  echo "state: $id marked [x]; ruling logged"
}

cmd_merge() {
  local id=${1:-} wt=${2:-} r st line g br wh m
  [ -n "$id" ] && [ -n "$wt" ] || die "usage: merge <ID> <worktree-dir>"
  r=$(root) || exit 2; st="$r/$ORCH/STATE.md"
  [ -d "$wt" ] || die "worktree not found: $wt"
  wt=$(git -C "$wt" rev-parse --show-toplevel 2>/dev/null) || die "not a git checkout: $wt"
  line=$(task_line "$st" "$id"); g=$(task_meta "$line" gate)
  case $g in PASS@*) ;; *) die "gate $id has not passed in its worktree; run: orch.sh gate $id <BASE> $wt" ;; esac
  case $(task_meta "$line" review) in pending|changes) die "$id is high risk and its review is not approved; run: orch.sh review $id $wt" ;; esac
  git -C "$wt" diff --quiet "${g#PASS@}" HEAD -- . ":(exclude)$ORCH" 2>/dev/null || die "the worktree changed since its gate passed; gate it again"
  [ -z "$(dirty_files "$r")" ] || die "the main checkout has uncommitted product changes; commit or remove them first"
  # Merge the commit, not the branch name: a detached worktree reports its branch as "HEAD".
  br=$(git -C "$wt" rev-parse --abbrev-ref HEAD); wh=$(git -C "$wt" rev-parse HEAD)
  if ! git -C "$r" merge --no-ff --no-edit -m "Merge $id from worktree ($br)" "$wh" > /dev/null 2>&1; then
    git -C "$r" merge --abort > /dev/null 2>&1
    state_task "$st" "$id" "~" "merge=conflict" 1; ledger "merge $id CONFLICT ($br)"
    echo "MERGE CONFLICT: aborted. Re-run $id sequentially on the new HEAD with a fresh executor; add to its brief Notes:"
    echo "  \"Parallel attempt conflicted; commit $(short "$r" "$wh") (branch $br) shows the earlier work.\" Keep the worktree until then."
    return 1
  fi
  git -C "$r" merge-base --is-ancestor "$wh" HEAD || die "the worktree's work is not in the run branch after the merge; worktree kept"
  m=$(short "$r" HEAD)
  if ! cmd_verify "$id"; then
    state_task "$st" "$id" "~" "merge=$m verify=FAIL" 1; ledger "merge $id at $m, but Verify fails on the run branch"
    echo "MERGED at $m but the task's Verify fails on the run branch: an interaction with earlier merges. Fix before continuing."
    return 1
  fi
  state_task "$st" "$id" "x" "done merged $m (gate PASS)" 0
  ledger "merge $id $m (verify PASS)"
  git -C "$r" worktree remove --force "$wt" > /dev/null 2>&1 || echo "note: could not remove worktree $wt"
  if [ "$br" != HEAD ]; then git -C "$r" branch -d "$br" > /dev/null 2>&1 || echo "note: branch $br not deleted (git branch -d refused)"; fi
  echo "state: $id marked [x] (merged $m); worktree removed"
}

cmd_slop() {
  local base=${1:-} r
  [ -n "$base" ] || die "usage: slop <BASE>"
  r=$(root) || exit 2
  git -C "$r" rev-parse -q --verify "$base^{commit}" > /dev/null || die "BASE $base not found"
  added_lines "$r" "$base" | slop_scan "$r" "$base" 0
  added_lines "$r" "$base" all | secret_scan "$r" | sed 's/^/secret? (value not shown): /'
  git -C "$r" -c core.quotepath=off diff --name-only --no-renames "$base" HEAD -- . ":(exclude)$ORCH" | grep -E -- "$MANIFEST_RE" | sed 's/^/dependency manifest changed: /'
  return 0
}

cmd_risk() {
  local r base=${1:-} hits
  r=$(root) || exit 2
  [ -n "$base" ] || base=$(st_get "$r/$ORCH/STATE.md" run-base 2>/dev/null)
  [ -n "$base" ] || die "usage: risk <BASE>"
  hits=$(git -C "$r" -c core.quotepath=off diff --name-only --no-renames "$base" HEAD -- . ":(exclude)$ORCH" | risk_hits "$r")
  if [ -n "$hits" ]; then echo "risk: high (needs a code owner's review before merge)"; printf '%s\n' "$hits" | head -n 20 | sed 's/^/  /'; return 0; fi
  echo "risk: not high by path (the plan's tier still applies)"
}

cmd_quick() {
  local r td hits rc=0
  r=$(root) || exit 2
  td=$(tmpdir)
  added_lines_wt "$r" > "$td/added"
  { git -C "$r" -c core.quotepath=off diff --name-only HEAD -- . ":(exclude)$ORCH"; git -C "$r" -c core.quotepath=off ls-files --others --exclude-standard -- . ":(exclude)$ORCH"; } | LC_ALL=C sort -u > "$td/changed"
  echo "quick: $(wc -l < "$td/changed" | tr -d ' ') changed file(s) (uncommitted, against HEAD)"
  secret_scan "$r" < "$td/added" > "$td/secrets"
  if [ -s "$td/secrets" ]; then echo "SECRET: credential-like value(s) (values not shown): $(tr '\n' ' ' < "$td/secrets")"; rc=1; fi
  slop_scan "$r" "" 0 < "$td/added"
  hits=$(risk_hits "$r" < "$td/changed")
  if [ -n "$hits" ]; then
    echo "RISK: high-risk path(s), so this is not a size-XS change; use the full workflow: $(printf '%s\n' "$hits" | head -n 5 | tr '\n' ' ')"
    [ "$rc" = 0 ] && rc=3
  fi
  [ "$rc" = 0 ] && echo "QUICK: PASS"
  rm -rf "$td"
  return $rc
}

cmd_sync() {
  local r def mb behind ahead rbase ours theirs overlap
  r=$(root) || exit 2
  git -C "$r" remote get-url origin > /dev/null 2>&1 || { echo "sync: no 'origin' remote; skipped"; return 0; }
  def=$(git -C "$r" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null); def=${def#origin/}
  if [ -z "$def" ]; then for b in main master trunk develop; do git -C "$r" rev-parse -q --verify "refs/remotes/origin/$b" > /dev/null && { def=$b; break; }; done; fi
  [ -n "$def" ] || { echo "sync: can't tell the default branch (run: git remote set-head origin --auto)"; return 0; }
  git -C "$r" fetch -q origin "$def" 2>/dev/null || echo "sync: fetch failed (offline?); comparing with the last fetched origin/$def"
  mb=$(git -C "$r" merge-base HEAD "origin/$def" 2>/dev/null) || { echo "sync: no common history with origin/$def"; return 0; }
  behind=$(git -C "$r" rev-list --count "HEAD..origin/$def"); ahead=$(git -C "$r" rev-list --count "origin/$def..HEAD")
  echo "sync: $behind commit(s) behind origin/$def, $ahead ahead"
  [ "$behind" = 0 ] && return 0
  rbase=$(st_get "$r/$ORCH/STATE.md" run-base 2>/dev/null); rbase=${rbase:-$mb}
  ours=$(tmpf); theirs=$(tmpf)
  git -C "$r" diff --name-only "$rbase" HEAD -- . ":(exclude)$ORCH" | LC_ALL=C sort -u > "$ours"
  git -C "$r" diff --name-only "$mb" "origin/$def" | LC_ALL=C sort -u > "$theirs"
  overlap=$(LC_ALL=C comm -12 "$ours" "$theirs")
  rm -f "$ours" "$theirs"
  if [ -n "$overlap" ]; then echo "OVERLAP: files changed both here and upstream (conflict and semantic-merge risk):"; printf '%s\n' "$overlap" | head -n 15 | sed 's/^/  /'; fi
  echo "next: git merge --no-edit origin/$def   (then orch.sh verify-all; a new failure may come from upstream: check it on origin/$def)"
}

cmd_pr_body() {
  local r d st plan tier hits
  r=$(root) || exit 2; d="$r/$ORCH"; st="$d/STATE.md"; plan="$d/PLAN.md"
  [ -f "$plan" ] || die "no run here (missing $ORCH/PLAN.md)"
  hits=$(git -C "$r" -c core.quotepath=off diff --name-only --no-renames "$(st_get "$st" run-base)" HEAD -- . ":(exclude)$ORCH" 2>/dev/null | risk_hits "$r")
  tier="not high by path"; [ -n "$hits" ] && tier="HIGH: needs a code owner's approval before merge"
  echo "## $(awk 'NR == 1 { sub(/\r$/, ""); sub(/^# *PLAN: */, ""); print; exit }' "$plan")"
  echo
  section_text "$plan" "## Plain-language summary" | sed '/^<!--/,/-->$/d'
  echo
  echo "### Requirement"
  section_text "$plan" "## Requirement"
  echo "### Acceptance criteria"
  section_text "$plan" "## Acceptance criteria"
  if [ -n "$(section_text "$plan" "## Examples" | grep '^|')" ]; then echo "### Examples confirmed with the requester"; section_text "$plan" "## Examples"; fi
  echo "### Risk"
  echo "- Path risk: $tier"
  [ -n "$hits" ] && printf '%s\n' "$hits" | head -n 10 | sed 's/^/  - /'
  echo "### Rollback"
  section_text "$plan" "## Rollback"
  echo "### Tasks"
  section_text "$st" "## Tasks" | grep '^- \['
  if grep -q '^- .*Ruling:' "$d/LEDGER.md" 2>/dev/null; then
    echo "### Decisions made without asking (rulings)"
    grep '^- .*Ruling:' "$d/LEDGER.md" | sed 's/^- [^ ]* /- /'
  fi
  echo "### Verification"
  if [ -f "$d/logs/verify-all.last" ]; then
    awk -F'\t' '{ printf "- step %s %s: `%s`\n", $1, ($2 == 0 ? "PASS" : "FAIL (exit " $2 ")"), $4 }' "$d/logs/verify-all.last"
  else
    echo "- run orch.sh verify-all"
  fi
  [ -f "$d/baseline/global.steps" ] && echo "- baseline: $(awk -F'\t' '$2 != 0 { f++ } END { print (f + 0) " step(s) already failing before this change" }' "$d/baseline/global.steps")"
  echo
  echo "_Built with orchestrate-kit. Commits prefixed chore(orch) are bookkeeping; squash-merge keeps main's history clean._"
}

cmd_finish() {
  local force=0 r d st run open arch prev sha
  [ "${1:-}" = --force ] && force=1
  r=$(root) || exit 2; d="$r/$ORCH"; st="$d/STATE.md"
  [ -f "$st" ] || die "no run here (missing $ORCH/STATE.md)"
  run=$(st_get "$st" run)
  open=$(awk '/^## Tasks/ { t = 1; next } t && /^## / { exit } t && /^- \[[ ~!]\]/' "$st")
  if [ -n "$open" ] && [ "$force" = 0 ]; then
    printf 'open tasks:\n%s\n' "$open"
    die "tasks are still open; finish them, drop them ([-] with a ruling), or abandon the run with: orch.sh finish --force"
  fi
  state_status "$st" done
  ledger "finish run=$run$([ "$force" = 1 ] && echo ' (forced)')"
  arch="$(priv "$r")/archive/$run-$(date -u +%Y%m%d%H%M%S)"
  mkdir -p "$arch" && cp -R "$d/." "$arch/"
  cmd_pr_body > "$arch/PR.md" 2>/dev/null
  awk '/ dispatch / { n += NF - 3 } / gate .* PASS/ { p++ } / gate .* FAIL/ { f++ }
       END { printf "stats: %d dispatch(es), %d gate pass(es), %d gate fail(s)\n", n, p, f }' "$d/LEDGER.md"
  prev=$(cmd_checkpoint "done $run") || exit 2
  git -C "$r" rm -r -q --ignore-unmatch -- "$ORCH" > /dev/null 2>&1
  rm -rf "${d:?}"
  if ! git -C "$r" diff --cached --quiet -- "$ORCH" 2>/dev/null; then
    git -C "$r" commit -q --no-verify -m "chore(orch): finish $run (run state removed from the branch)" -- "$ORCH" > /dev/null 2>&1 || die "git commit failed"
    sha=$(git -C "$r" rev-parse HEAD); ckpt_record "$r" "$sha"
  fi
  echo "finished run '$run': $ORCH/ removed from the branch, so it never reaches main."
  echo "  full state: $(short "$r" "$prev") in git history, and a copy at ${arch#"$r"/}"
  echo "  pull request description: ${arch#"$r"/}/PR.md (or: git show $(short "$r" "$prev"):$ORCH/PLAN.md)"
}

# ---------------------------------------------------------------- Claude Code hooks
# SessionStart: put an active run's next action in context after startup, resume or compaction.
cmd_hook_session() {
  local r st status br cur
  [ -t 0 ] || cat > /dev/null 2>&1
  r=$(git rev-parse --show-toplevel 2>/dev/null) || return 0
  st="$r/$ORCH/STATE.md"; [ -f "$st" ] || return 0
  status=$(st_get "$st" status); [ "$status" = done ] && return 0
  br=$(st_get "$st" branch); cur=$(git -C "$r" rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [ "$br" != "$cur" ]; then
    echo "[orchestrate] $ORCH/STATE.md belongs to branch '$br', not '$cur': it is not a run of this branch. Ignore it unless the user asks."
    return 0
  fi
  echo "[orchestrate] Run '$(st_get "$st" run)' is in progress on this branch (status: $status)."
  section_text "$st" "## NEXT ACTION" | grep . | head -n 6 | sed 's/^/NEXT ACTION: /'
  echo "Before other work, load the orchestrate skill and follow its Resume protocol. Never redo a [x] task. Subagents: ignore this and follow your dispatch."
  return 0
}

# Forward slashes; on Windows also MSYS forms (/c/x, /tmp/x) -> c:/x and a lower-case drive letter.
# Pure bash except cygpath for mount paths such as /tmp: the hooks call it on every tool use.
norm_path() {
  local p=${1//\\//} up=ABCDEFGHIJKLMNOPQRSTUVWXYZ low=abcdefghijklmnopqrstuvwxyz pre
  case ${OSTYPE:-} in
    msys*|cygwin*|win*)
      case $p in
        /[A-Za-z]/*) p="${p:1:1}:${p:2}" ;;
        /*) if command -v cygpath > /dev/null 2>&1; then p=$(cygpath -m "$p" 2>/dev/null || printf '%s' "$p"); fi ;;
      esac
      case $p in [A-Z]:*) pre=${up%%"${p:0:1}"*}; p="${low:${#pre}:1}${p:1}" ;; esac ;;
  esac
  printf '%s' "$p"
}

# PreToolUse: while a run is active on this branch, block what the kit's subagents must never do, and
# ask before risky commands from the main session. Fails open: no output and exit 0 mean "no opinion".
# Not a security boundary (a determined agent can obfuscate a command; the sandbox is the boundary).
# It stops honest mistakes and reward hacking, and each decision names the rule so the agent reports
# instead of retrying. It runs on every tool call, so it spawns as few processes as it can.
cmd_hook_pretool() {
  local input="" line kv tool="" agent="" atype="" path="" cmd="" cwd="" info top common cur cdup lroot mr st status="" sbr="" verdict="" reason=""
  [ -t 0 ] && return 0
  # Fast path: no run state in the project at all.
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ ! -f "$(norm_path "$CLAUDE_PROJECT_DIR")/$ORCH/STATE.md" ]; then
    IFS= read -r -d '' input || true; return 0
  fi
  IFS= read -r -d '' input || true
  kv=$(printf '%s' "$input" | awk -f <(printf '%s' '
    BEGIN { RS = "\001" }
    # The string value of the first "key": "..." in the input, JSON escapes decoded (newline -> \003).
    function val(k,   L, pos, st, c, d, out) {
      if (!match(BLOB, "\"" k "\"[ \t\r\n]*:[ \t\r\n]*\"")) return ""
      pos = RSTART + RLENGTH; L = length(BLOB); st = pos; out = ""
      while (pos <= L) {
        c = substr(BLOB, pos, 1)
        if (c == "\\") {
          out = out substr(BLOB, st, pos - st); d = substr(BLOB, pos + 1, 1)
          if (d == "n" || d == "r") out = out "\003"; else if (d == "t") out = out " "; else if (d == "u") { out = out "?"; pos += 4 } else out = out d
          pos += 2; st = pos; continue
        }
        if (c == "\"") break
        pos++
      }
      out = out substr(BLOB, st, pos - st)
      gsub(/[\001\002\004-\037]/, " ", out)
      return out
    }
    { BLOB = $0
      print "tool=" val("tool_name"); print "agent=" val("agent_id"); print "atype=" val("agent_type")
      print "cwd=" val("cwd"); print "path=" val("file_path") val("notebook_path"); print "cmd=" val("command") }'))
  while IFS= read -r line; do
    case $line in
      tool=*) tool=${line#tool=} ;; agent=*) agent=${line#agent=} ;; atype=*) atype=${line#atype=} ;;
      cwd=*) cwd=${line#cwd=} ;; path=*) path=${line#path=} ;; cmd=*) cmd=${line#cmd=} ;;
    esac
  done <<EOF
$kv
EOF
  case $tool in Bash|PowerShell|Edit|Write|MultiEdit|NotebookEdit) ;; *) return 0 ;; esac
  case $tool in Edit|Write|MultiEdit|NotebookEdit) [ -n "$agent" ] || return 0 ;; esac
  cmd=${cmd//$'\003'/$'\n'}
  cwd=$(norm_path "${cwd:-.}")
  [ -d "$cwd" ] || cwd=.
  # One git call: checkout root, common dir (to find the main checkout of a worktree), branch, way up to the root.
  info=$(git -C "$cwd" rev-parse --show-toplevel --git-common-dir --abbrev-ref HEAD --show-cdup 2>/dev/null) || return 0
  { IFS= read -r top; IFS= read -r common; IFS= read -r cur; IFS= read -r cdup; } <<EOF
$info
EOF
  mr=$top
  case $common in /*|[A-Za-z]:*) case $common in */.git) mr=${common%/.git} ;; esac ;; esac
  st="$mr/$ORCH/STATE.md"; [ -f "$st" ] || return 0
  while IFS= read -r line; do
    line=${line%$'\r'}
    case $line in status:*) status=${line#status:} ;; branch:*) sbr=${line#branch:} ;; '## '*) break ;; esac
  done < "$st"
  status=${status#"${status%%[![:space:]]*}"}; sbr=${sbr#"${sbr%%[![:space:]]*}"}
  [ "$status" = done ] && return 0
  [ "$mr" = "$top" ] || cur=$(git -C "$mr" rev-parse --abbrev-ref HEAD 2>/dev/null)
  [ "$sbr" = "$cur" ] || return 0
  case $tool in
    Bash|PowerShell)
      if [ "${#cmd}" -gt 262144 ]; then
        [ -n "$agent" ] && { verdict=deny; reason="a command over 256 KB can't be checked; write files with the Write tool and run short commands"; }
      else
        reason=$(guard_command "$cmd" "${agent:+sub}" "$atype")
        case $reason in '') ;; ask:*) verdict=ask; reason=${reason#ask:} ;; *) verdict=deny ;; esac
      fi ;;
    *)
      # Tool paths are logical; git reports the physical root. Accept either (junctions, symlinks, /tmp on macOS).
      lroot=$(cd "$cwd" 2>/dev/null && cd "./$cdup" 2>/dev/null && pwd)
      reason=$(guard_path "$path" "$atype" "$top" "$mr" "$lroot")
      [ -n "$reason" ] && verdict=deny ;;
  esac
  [ -n "$verdict" ] || return 0
  reason="orchestrate guard: $reason"
  reason=${reason//\\/\\\\}; reason=${reason//\"/\\\"}; reason=${reason//$'\n'/ }; reason=${reason//$'\t'/ }
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":"%s"}}\n' "$verdict" "$reason"
  return 0
}

# guard_path <path> <agent type> <checkout root> <main root> [logical root]: a reason to deny a
# subagent's edit, or nothing. One awk: resolves the path (and any . or ..), then checks it against
# the write-sets of the tasks in progress.
guard_path() {
  local p rr lr="" win=0
  [ -n "$1" ] || return 0
  p=$(norm_path "$1"); rr=$(norm_path "$3")
  [ -n "${5:-}" ] && lr=$(norm_path "$5")
  case ${OSTYPE:-} in msys*|cygwin*|win*) win=1 ;; esac
  awk -v p="$p" -v rr="$rr" -v lr="$lr" -v atype="$2" -v orch="$ORCH" -v win="$win" -v state="$4/$ORCH/STATE.md" -v tasks="$4/$ORCH/tasks" -f <(printf '%s' '
    function esc(c) { return index("\\^$.|?+()[]{}", c) ? "\\" c : c }
    function glob2re(s,   out, i, c) {
      out = ""
      for (i = 1; i <= length(s); i++) {
        c = substr(s, i, 1)
        if (c == "*") { if (substr(s, i + 1, 1) == "*") { out = out ".*"; i++ } else out = out "[^/]*" }
        else out = out esc(c)
      }
      return "^" out "$"
    }
    function covers(f, e) {
      if (f == e) return 1
      if (substr(e, length(e), 1) == "/" && index(f, e) == 1) return 1
      if (index(e, "*") && f ~ glob2re(e)) return 1
      return 0
    }
    # Collapse "." and ".." segments and doubled slashes.
    function normp(x,   n, parts, i, top, out, k, stk) {
      n = split(x, parts, "/"); top = 0
      for (i = 1; i <= n; i++) {
        if (parts[i] == "." || (parts[i] == "" && i > 1)) continue
        if (parts[i] == "..") { if (top > 1) top--; continue }
        stk[++top] = parts[i]
      }
      out = stk[1]; for (k = 2; k <= top; k++) out = out "/" stk[k]
      return out == "" ? "/" : out
    }
    function under(path, root,   lp, lroot) {
      if (root == "") return 0
      lp = path; lroot = root
      if (win) { lp = tolower(lp); lroot = tolower(lroot) }
      return index(lp, lroot "/") == 1
    }
    BEGIN {
      if (p !~ /^\// && p !~ /^[A-Za-z]:\//) p = rr "/" p
      p = normp(p); rr = normp(rr); if (lr != "") lr = normp(lr)
      if (under(p, rr)) rel = substr(p, length(rr) + 2)
      else if (under(p, lr)) rel = substr(p, length(lr) + 2)
      else { print "orchestrate agents may not write outside the repository (" p ")"; exit }
      if (rel == ".git" || rel ~ /^\.git\//) { print "direct edits under .git/ are not allowed"; exit }
      if (atype == "orch-executor" && index(rel, orch "/reports/") == 1 && rel ~ /review/) { print "executors may not write review files (" rel "); only orch-reviewer does"; exit }
      if (index(rel, orch "/reports/") == 1 || index(rel, orch "/recon/") == 1) exit
      if (rel == orch || index(rel, orch "/") == 1) { print "agents may not edit run state (" rel "): the orchestrator owns briefs, PLAN, STATE and LEDGER. Report the problem instead"; exit }
      if (atype == "orch-scout" || atype == "orch-reviewer") { print atype " is read-only: it may write only its OUT file under " orch "/"; exit }
      n = 0; t = 0
      while ((getline l < state) > 0) {
        sub(/\r$/, "", l)
        if (l ~ /^## Tasks/) { t = 1; continue }
        if (t && l ~ /^## /) break
        if (t && substr(l, 1, 6) == "- [~] ") { split(substr(l, 7), w, " "); ids[++n] = w[1] }
      }
      if (n == 0) { print "no task is in progress, so no product file may change (" rel ")"; exit }
      ok = 0; idl = ""
      for (k = 1; k <= n && !ok; k++) {
        idl = idl " " ids[k]; f = tasks "/" ids[k] ".md"; ins = 0
        while ((getline l < f) > 0) {
          sub(/\r$/, "", l)
          if (l ~ /^## Write-set/) { ins = 1; continue }
          if (ins && l ~ /^## /) break
          if (ins && l ~ /^[ \t]*[-*][ \t]+/) {
            e = l; sub(/^[ \t]*[-*][ \t]+/, "", e)
            if (match(e, /^[A-Za-z]+:[ \t]*/)) e = substr(e, RLENGTH + 1)
            if (substr(e, 1, 1) == "`") { e = substr(e, 2); i = index(e, "`"); if (i > 0) e = substr(e, 1, i - 1) }
            else { split(e, parts, /[ \t]+/); e = parts[1]; gsub(/`/, "", e) }
            if (e != "" && e !~ /^</ && covers(rel, e)) ok = 1
          }
        }
        close(f)
      }
      if (!ok) print rel " is outside the write-set of the task in progress (" substr(idl, 2) "). If it truly must change, stop and report NEEDS_CONTEXT naming the file and why"
    }')
}

# guard_command <command> <"sub" for a subagent> <agent type>: prints "<reason>" to deny,
# "ask:<reason>" to ask the user, or nothing.
guard_command() {
  [ -n "$1" ] || return 0
  printf '%s\n' "$1" | awk -v sub_="$2" -v atype="$3" -v orch="$ORCH" -v dburl="${DATABASE_URL:-}" -f <(printf '%s' '
    # Split into simple commands, one per line of output. A quoted string stays one token: it starts
    # with \005 and its blanks become \002 (inside double quotes, \" does not close the string). The
    # body of a bash -c / sh -c / cmd /c / eval / pwsh -Command string, and a heredoc fed to a shell,
    # are checked as commands of their own (EXTRA); other heredoc bodies are data and skipped. A
    # backslash-newline joins lines; a backslash keeps the next character (PowerShell paths too).
    # Each character is visited once, so long commands stay fast.
    function split_cmds(s,   nl, li, line, i, j, L, c, d, k, q, chunk, nw, tw, pw, x, cur, out, hd, hdsh, t) {
      nl = split(s, LN, "\n"); out = ""; cur = ""; hd = ""; hdsh = 0; li = 1
      while (li <= nl) {
        line = LN[li]; li++; sub(/\r$/, "", line)
        if (hd != "") { t = line; sub(/^\t+/, "", t); if (t == hd) hd = ""; else if (hdsh) EXTRA = EXTRA "\n" line; continue }
        i = 1; L = length(line)
        while (i <= L) {
          c = substr(line, i, 1)
          if (c == "\\") {
            if (i == L) { if (li <= nl) { line = substr(line, 1, L - 1) " " LN[li]; li++; sub(/\r$/, "", line); L = length(line); continue } i++; continue }
            cur = cur c substr(line, i + 1, 1); i += 2; continue
          }
          if (c == "\"" || c == "'\''") {
            q = c; chunk = ""; i++
            while (1) {
              k = 0
              if (q == "'\''") { k = index(substr(line, i), q); if (k) k = i + k - 1 }
              else { for (j = i; j <= L; j++) { d = substr(line, j, 1); if (d == "\\") { j++; continue } if (d == "\"") { k = j; break } } }
              if (k) { chunk = chunk substr(line, i, k - i); i = k + 1; break }
              chunk = chunk substr(line, i) "\n"
              if (li > nl) { i = L + 1; break }
              line = LN[li]; li++; sub(/\r$/, "", line); L = length(line); i = 1
            }
            nw = split(cur, tw, /[ \t]+/); pw = tw[nw]; if (pw == "" && nw > 1) pw = tw[nw - 1]
            if (pw ~ /^(-c|-lc|-ic|-Command|-command|\/c|\/C|\/\/c|eval|iex|Invoke-Expression)$/) EXTRA = EXTRA "\n" chunk
            gsub(/[ \t\n]/, "\002", chunk)
            cur = cur "\005" chunk
            continue
          }
          if (c == "<" && substr(line, i + 1, 1) == "<" && substr(line, i + 2, 1) != "<") {
            t = substr(line, i + 2); sub(/^-/, "", t); sub(/^[ \t]*/, "", t)
            if (match(t, /^["'\'']?[A-Za-z_][A-Za-z0-9_]*/)) { hd = substr(t, RSTART, RLENGTH); gsub(/["'\'']/, "", hd) }
            hdsh = 0; nw = split(cur, tw, /[ \t]+/)
            for (x = 1; x <= nw; x++) { t = tw[x]; sub(/^.*[\/\\]/, "", t); if (t ~ /^(bash|sh|zsh|dash|ksh|pwsh|powershell)(\.exe)?$/) hdsh = 1 }
            cur = cur " << "; i += 2; continue
          }
          if (c == ";" || c == "|" || c == "&" || c == "(" || c == ")" || c == "`") { out = out "\n" cur; cur = ""; i++; continue }
          if (c == "$" && substr(line, i + 1, 1) == "(") { out = out "\n" cur; cur = ""; i += 2; continue }
          cur = cur c; i++
        }
        out = out "\n" cur; cur = ""
      }
      return out "\n" cur
    }
    function clean(t) { gsub(/\002/, " ", t); gsub(/\005/, "", t); return t }
    function isq(t) { return index(t, "\005") > 0 }
    function base(t) { gsub(/[\002\005]/, "", t); sub(/^.*[\/\\]/, "", t); sub(/\.(exe|cmd|bat|ps1)$/, "", t); return t }
    function islocal(h) { return h ~ /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?|host\.docker\.internal)$/ }
    function hostof(u) { sub(/^[A-Za-z+]+:\/\//, "", u); sub(/[\/?#].*$/, "", u); sub(/^.*@/, "", u); sub(/:[0-9]+$/, "", u); return u }
    function deny(m) { if (D == "") D = m }
    function ask(m) { if (A == "") A = m }
    function info(i,   j, t) {   # there are words after i, and each asks for a version or help
      if (i >= N) return 0
      for (j = i + 1; j <= N; j++) { t = clean(W[j]); if (t !~ /^(-v|-V|--version|version|-h|--help|help)$/) return 0 }
      return 1
    }
    # First operand after word i, skipping options and the values of options that take one. Sets SCI.
    function subcmd(p, i,   j, t) {
      for (j = i + 1; j <= N; j++) {
        t = W[j]
        if (isq(t)) { SCI = j; return clean(t) }
        if (t ~ /^-/) {
          if (t ~ /=/) continue
          if (p == "git" && t ~ /^(-C|-c|--git-dir|--work-tree|--namespace|--exec-path)$/) { j++; continue }
          if (p ~ /^(npm|pnpm|yarn|bun|npx)$/ && t ~ /^(--prefix|-C|--dir|--filter|-F|--workspace|-w|--cwd|-p|--package)$/) { j++; continue }
          continue
        }
        if (p == "yarn" && t == "workspace") { j++; continue }
        SCI = j; return t
      }
      SCI = N + 1; return ""
    }
    # Options after word si as " -a --b ", leaving out quoted words and the values of message and file options.
    function flagsafter(si,   j, t, f) {
      f = " "
      for (j = si + 1; j <= N; j++) {
        t = W[j]
        if (isq(t)) continue
        if (t ~ /^(-m|--message|-F|--file|-C|-c|--author|--date|--template|-t|-S)$/) { j++; continue }
        if (t ~ /^-/) f = f t " "
      }
      return f
    }
    # Operands after word si as " a b ", cleaned, skipping options and their values.
    function operands(si,   j, t, f) {
      f = " "
      for (j = si + 1; j <= N; j++) {
        t = W[j]
        if (!isq(t) && t ~ /^(-m|--message|-F|--file|-C|-c|--author|--date|--template|-t)$/) { j++; continue }
        if (!isq(t) && t ~ /^-/) continue
        f = f clean(t) " "
      }
      return f
    }
    # A reference to a real .env file (not .env.example and friends, not source files such as .env.ts).
    function envref(s,   rest, m, pre, nxt, suf) {
      rest = s
      while (match(rest, /\.env(\.[A-Za-z0-9_-]+)?\*?/)) {
        pre = (RSTART > 1) ? substr(rest, RSTART - 1, 1) : ""
        m = substr(rest, RSTART, RLENGTH); rest = substr(rest, RSTART + RLENGTH); nxt = substr(rest, 1, 1)
        if (pre ~ /[A-Za-z0-9_]/ || nxt ~ /[A-Za-z0-9_]/) continue
        suf = m; sub(/^\.env\.?/, "", suf); sub(/\*$/, "", suf)
        if (suf ~ /^(example|sample|template|dist|ts|tsx|js|jsx|mjs|cjs|py|go|rb|rs|java|kt|cs|php|json|ya?ml|toml|md|d)$/) continue
        return 1
      }
      return (s ~ /(^|[^A-Za-z0-9_.])\.envrc([^A-Za-z0-9_]|$)/)
    }
    function outside(u) {   # a delete target outside the checkout
      if (u ~ /(^|\/)\.\.(\/|$)/) return 1
      if (u ~ /^(\/tmp\/|\/var\/tmp\/|\$TMPDIR\/|\$\{TMPDIR\}\/|\$env:TEMP\/|\$env:TMP\/)/) return 0
      return (u ~ /^(\/|~|\$HOME|\$\{HOME\}|\$env:|%[A-Za-z]+%|[A-Za-z]:|\.\.)/ || u ~ /\/\.\.(\/|$)/ || u ~ /^(\.|\.\/|\*|\.\/\*|\.git|\.git\/.*|\.orchestrator|\.orchestrator\/(tasks|baseline).*|\.orchestrator\/[A-Z]+\.md)$/)
    }
    function check(seg,   n, i, j, p, sc, si, fl, ops, args, k, u, nonlocal, up, segp, t, guard, script) {
      gsub(/^[ \t]+|[ \t]+$/, "", seg); if (seg == "") return
      N = split(seg, W, /[ \t]+/)
      segp = clean(seg); gsub(/\\/, "/", segp)
      if (N == 1 && sub_ != "" && base(W[1]) ~ /^(env|printenv|set|export|declare|Get-ChildItem|gci)$/) { deny("dumping the environment would put secrets in the transcript"); return }
      if (sub_ != "" && (segp ~ /GetEnvironmentVariables/ || W[1] ~ /^\$\{?(env:)?[A-Z0-9_]*(SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_?KEY|ACCESS_KEY|_TOKEN|TOKEN_|CREDENTIAL)/)) { deny("printing secret-looking variables would put them in the transcript"); return }
      # Strip wrappers: variable assignments, sudo, env, command, exec, nohup, time, nice, timeout N, xargs, cmd /c.
      for (i = 1; i <= N; i++) {
        p = base(W[i])
        if (W[i] ~ /^[A-Za-z_][A-Za-z0-9_]*=/ || p == "{" || p == "!" || p == "then" || p == "do" || p == "else") continue
        if (p ~ /^(sudo|doas)$/) { if (sub_ != "") deny(p " is not allowed for orchestrate agents"); continue }
        if (p ~ /^(env|command|builtin|exec|nohup|time|nice|xargs|stdbuf|unbuffer)$/) continue
        if (p == "timeout") { i++; continue }
        if (p == "cmd" && W[i + 1] ~ /^\/\/?[cCkK]$/) { i++; continue }
        break
      }
      if (i > N) return
      p = base(W[i])
      # Package runners: check the program they run.
      for (guard = 0; guard < 3; guard++) {
        sc = subcmd(p, i)
        if (p ~ /^(npx|bunx|pnpx)$/ || (p ~ /^(npm|pnpm)$/ && sc == "exec") || (p ~ /^(pnpm|yarn)$/ && sc == "dlx") || (p == "bun" && sc == "x")) {
          # Runners that download packages: always for bunx, pnpx and dlx; for npx and npm exec with --yes.
          if (sub_ != "" && (p ~ /^(bunx|pnpx)$/ || sc == "dlx" || (p == "bun" && sc == "x") || flagsafter(i) ~ / (-y|--yes) /)) {
            deny(p " downloads and runs packages that are not installed; the orchestrator installs what the plan needs"); return
          }
          j = (p ~ /^(npx|bunx|pnpx)$/) ? i : SCI
          k = 0
          for (j = j + 1; j <= N; j++) {
            if (!isq(W[j]) && W[j] ~ /^(-p|--package|-c|--call)$/) { j++; continue }
            if (!isq(W[j]) && W[j] ~ /^-/) continue
            k = j; break
          }
          if (k == 0) return
          i = k; p = base(W[i]); continue
        }
        break
      }
      sc = subcmd(p, i); si = SCI
      args = " "; for (j = i + 1; j <= N; j++) args = args clean(W[j]) " "
      fl = flagsafter(i)

      # orch.sh: agents may run only the read-only subcommands.
      if (segp ~ /orch\.sh/) {
        if (sub_ != "" && segp ~ /orch\.sh +(init|checkpoint|dispatch|review|accept|merge|finish|baseline|sync)( |$)/) deny("orch.sh state-changing commands belong to the orchestrator; agents run only status, verify, gate --check, slop, quick")
        else if (sub_ != "" && segp ~ /orch\.sh +gate( |$)/ && segp !~ /--check/) deny("agents run the gate only with --check; the orchestrator runs the real gate")
        return
      }

      if (p == "git") {
        fl = flagsafter(si); ops = operands(si)
        if (fl ~ / --no-verify / || (sc == "commit" && fl ~ / -[a-zA-Z]*n[a-zA-Z]* /) || (sc == "push" && fl ~ / --no-verify /)) {
          if (sub_ != "") { deny("bypassing git hooks (--no-verify or -n) is not allowed"); return }
          ask("--no-verify skips the project'\''s git hooks")
        }
        if (sc == "push") {
          if (fl ~ / (-f|--force|--force-with-lease(=[^ ]*)?|--force-if-includes|--mirror|--delete|-d|--prune) / || ops ~ / [+:][^ ]*/) { deny("force pushes and remote deletes are blocked during orchestrate runs; run them yourself if intended"); return }
          if (sub_ != "") deny("git push is not allowed for orchestrate agents")
          else ask("git push sends code out of this repository; an orchestrate run needs the user'\''s explicit go-ahead")
          return
        }
        if (sub_ == "") {
          if (sc == "reset" && fl ~ / --hard /) ask("git reset --hard discards work")
          else if (sc == "clean" && fl ~ / -[a-zA-Z]*f/) ask("git clean -f deletes untracked files")
          else if (sc == "checkout" || sc == "switch") ask("git " sc " during a run moves the checkout off the run branch or discards files")
          else if (sc == "restore" && !(fl ~ / (--staged|-S) / && fl !~ / (--worktree|-W) /)) ask("git restore discards uncommitted work")
          else if (sc == "branch" && fl ~ / (-D|--delete|-d) /) ask("deleting a branch can lose work")
          else if (sc == "stash" && ops ~ / (drop|clear) /) ask("dropping stashes discards work")
          else if (sc == "rebase" || (sc == "commit" && fl ~ / --amend /)) ask("rewriting history during a run breaks the task gates")
          return
        }
        if (sc == "" || sc ~ /^(status|diff|log|show|rev-parse|rev-list|merge-base|ls-files|ls-tree|grep|blame|describe|cat-file|diff-tree|shortlog|check-ignore|name-rev|for-each-ref|show-ref|count-objects|version|help|var)$/) return
        if (sc == "add" || sc == "commit") {
          if (atype == "orch-scout" || atype == "orch-reviewer") { deny(atype " is read-only"); return }
          if (fl ~ / (-A|--all|-u|--update|--ignore-removal) / || fl ~ / -[a-zA-Z]*[Au][a-zA-Z]* / || (sc == "add" && ops ~ / (\.|\.\/|\.\.|\.\.\/|:\/|:\/\*|\*|\.\/\*) /) || (sc == "commit" && (fl ~ / -[a-zA-Z]*a[a-zA-Z]* / || ops ~ / (\.|\.\/|\.\.|\.\.\/|:\/) /))) {
            deny("stage explicit paths (git add <path>...): -A, -a, -u and . would sweep the orchestrator'\''s uncommitted run state into your commit"); return
          }
          if (sc == "commit" && fl ~ / --amend /) { deny("never amend; make a new commit"); return }
          t = ops; gsub(/ \.orchestrator\/reports\/[^ ]*/, " ", t)
          if (t ~ / \.orchestrator(\/[^ ]*)? /) { deny("agents may not commit run state under " orch "/ (only their REPORT)"); return }
          return
        }
        if (sc == "branch") {
          for (j = si + 1; j <= N; j++) if (isq(W[j]) || W[j] !~ /^(--show-current|-a|--all|-r|--remotes|-v|-vv|--verbose|--list|-l|--no-color)$/) break
          if (j > N) return
        }
        if ((sc == "worktree" || sc == "stash") && ops ~ / list /) return
        if (sc == "config" && (fl ~ / (--get|--get-all|--list|-l|--get-regexp|--show-origin) / || (ops ~ /^ [^ ]+ $/ && fl ~ /^ *$/))) return
        deny("git " sc " is not allowed for orchestrate agents (others share this checkout); report what you need instead")
        return
      }

      # Publishing and package releases.
      if ((p ~ /^(npm|pnpm|yarn|bun|cargo|poetry|uv)$/ && sc == "publish") || (p == "gem" && sc == "push") || (p == "twine" && sc == "upload") ||
          (p == "dotnet" && args ~ / nuget push /) || (p == "gh" && args ~ / (release (create|upload|edit|delete)|pr merge|repo (delete|edit|create)) /) ||
          (p == "docker" && sc == "push") || (p ~ /^(mvn|gradle|gradlew)$/ && args ~ / (deploy|publish) /)) {
        if (sub_ != "") deny("publishing is not allowed for orchestrate agents"); else ask("publishing leaves this repository"); return
      }
      # Deploy and release scripts (npm run deploy, make release, ...).
      script = ""
      if (p ~ /^(npm|pnpm|yarn|bun)$/) { script = (sc == "run" || sc == "run-script") ? clean(W[SCI + 1]) : sc }
      if (p == "make") script = sc
      if (script ~ /^(deploy|release|publish|ship|promote)(:.*)?$/) {
        if (sub_ != "") deny("deploy and release scripts are not allowed for orchestrate agents"); else ask(script " deploys or releases"); return
      }
      if (sub_ != "" && p == "gh") { deny("gh is not allowed for orchestrate agents"); return }
      if (sub_ != "" && p ~ /^(npm|pnpm|yarn|bun|pip|pip3|uv|poetry|pipenv|conda|mamba|cargo|go|gem|bundle|bundler|composer|brew|apt|apt-get|yum|dnf|apk|choco|winget|scoop|dotnet|nuget|pipx|uvx)$/) {
        if (p ~ /^(pipx|uvx)$/) { deny(p " downloads and runs packages; not allowed for orchestrate agents"); return }
        if ((p == "yarn" && sc == "" && !info(i)) || sc ~ /^(install|i|in|isntall|add|ci|clean-install|uninstall|un|unlink|remove|rm|r|update|up|upgrade|link|ln|dedupe|prune|require|get|reinstall|import|sync|lock)$/ || (p == "uv" && args ~ / pip (install|uninstall) /) || (p == "dotnet" && args ~ / (add|remove) package /)) {
          deny("installing, removing or publishing packages is the orchestrator'\''s job; report NEEDS_CONTEXT naming the package (" p " " sc ")")
          return
        }
      }
      if (sub_ != "" && p ~ /^(python|python3|py)$/ && args ~ / -m (pip|ensurepip) / && args ~ / (install|uninstall) /) { deny("pip install is the orchestrator'\''s job; report NEEDS_CONTEXT naming the package"); return }

      # Infrastructure, cloud and deploy tools.
      if (p ~ /^(terraform|tofu|terragrunt|pulumi|kubectl|helm|eksctl|aws|gcloud|gsutil|az|doctl|flyctl|fly|heroku|vercel|netlify|firebase|wrangler|serverless|sls|cdk|sam|ansible|ansible-playbook|nomad|vault|railway|supabase)$/) {
        if (info(i)) return
        if (sub_ != "") { deny(p " acts on real infrastructure or cloud accounts; not allowed for orchestrate agents"); return }
        if (p ~ /^(terraform|tofu|terragrunt)$/ && sc ~ /^(fmt|validate|plan|init|show|output|providers|graph|console|version)$/) return
        if (p == "kubectl" && sc ~ /^(get|describe|logs|version|explain|api-resources|api-versions|cluster-info|config|top|diff)$/) return
        if (p == "helm" && sc ~ /^(list|ls|status|get|history|show|template|lint|version|search|repo|dependency)$/) return
        ask(p " acts on real infrastructure or cloud accounts"); return
      }
      if (p == "docker" && (args ~ / (login|system prune|volume rm|volume prune|rmi) / || (args ~ / compose / && args ~ / down / && args ~ / (-v|--volumes) /))) {
        if (sub_ != "") deny("docker " sc " is not allowed for orchestrate agents"); else ask("docker " sc " affects things outside this repository"); return
      }

      # Destructive database operations, and migrations while DATABASE_URL points at a remote host.
      up = toupper(clean(seg))
      if (up ~ /DROP +(DATABASE|SCHEMA|TABLE)|TRUNCATE +(TABLE +)?[A-Z_"]|FLUSHALL|FLUSHDB|DROPDATABASE\(/ ||
          p ~ /^(dropdb|dropuser)$/ ||
          args ~ / (migrate reset|db:drop|db:reset|db:purge|db:schema:load|db:migrate:undo:all|migrate:rollback|migrate:reset|migrate:fresh|schema:drop|reset_db|sqlflush|dropAll|drop-all) / ||
          args ~ /--force-reset|--accept-data-loss/ ||
          (segp ~ /manage\.py/ && args ~ / flush /) || (p == "alembic" && args ~ / downgrade /) || (p == "flyway" && args ~ / clean /) ||
          (p == "liquibase" && args ~ / rollback/) || (p ~ /^(goose|dbmate|migrate)$/ && args ~ / (down|reset|drop|rollback) /)) {
        if (sub_ != "") deny("destructive database commands are not allowed for orchestrate agents"); else ask("this command can destroy database data")
        return
      }
      if (sub_ != "" && dburl != "" && segp ~ /(prisma|rails|rake|alembic|flyway|liquibase|knex|sequelize|typeorm|manage\.py|goose|dbmate|atlas|migrate)/ && segp ~ /(migrat|db:|upgrade|deploy|apply|push)/) {
        u = hostof(dburl)
        if (u != "" && !islocal(u)) { deny("DATABASE_URL points at " u ", not a local database: migrations against real data are not allowed"); return }
      }
      if (sub_ == "") return

      # Subagents only from here on.
      if (p ~ /^(ssh|scp|sftp|rsync|nc|ncat|netcat|telnet|ftp|socat)$/) { deny(p " opens connections outside this machine; not allowed for orchestrate agents"); return }
      if (p ~ /^(curl|wget|http|https|xh|Invoke-WebRequest|iwr|Invoke-RestMethod|irm)$/) {
        nonlocal = 0; k = 0
        for (j = i + 1; j <= N; j++) {
          u = clean(W[j])
          if (u ~ /^[A-Za-z+]+:\/\//) { k++; if (!islocal(hostof(u))) nonlocal = 1 }
          else if (u ~ /^(localhost|127\.0\.0\.1)(:|\/|$)/) k++
        }
        if (nonlocal || k == 0) { deny("network requests outside localhost are not allowed for orchestrate agents (no web access)"); return }
      }
      if (p ~ /^(printenv|export|declare|set)$/ && args ~ /^ *(-p|-x)? *$/) { deny("dumping the environment would put secrets in the transcript"); return }
      if (p ~ /^(Get-ChildItem|gci|dir|ls)$/ && args ~ / env: /) { deny("dumping the environment would put secrets in the transcript"); return }
      if (p ~ /^(echo|printf|printenv|print|Write-Output|Write-Host|cat)$/ && segp ~ /(\$\{?(env:)?|printenv +)[A-Z0-9_]*(SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_?KEY|ACCESS_KEY|_TOKEN|TOKEN_|CREDENTIAL)/) { deny("printing a secret-looking variable would put it in the transcript"); return }
      if (segp ~ /(~|\$HOME|\$\{HOME\}|\$env:(USERPROFILE|HOME)|%USERPROFILE%|\/home\/[^\/ ]+|\/Users\/[^\/ ]+|[A-Za-z]:\/Users\/[^\/ ]+)\/\.(ssh|aws|kube|docker|gnupg|config\/gcloud|config\/gh|azure|npmrc|yarnrc|pypirc|netrc|git-credentials)/ || segp ~ /id_rsa|id_ed25519|\.git-credentials/) {
        deny("access to credential files is not allowed"); return
      }
      # Reading .env: printing commands, and inline code (python -c, node -e) that names an env file.
      # Loading one for a program (--env-file .env, dotenv -f .env, source .env) does not print it.
      if (envref(segp) && (p ~ /^(cat|less|more|head|tail|type|bat|nl|tac|xxd|od|hexdump|strings|grep|egrep|fgrep|rg|ag|awk|gawk|sed|cut|sort|uniq|diff|Get-Content|gc|Select-String|sls)$/ ||
          (p ~ /^(python|python3|py|node|deno|bun|ruby|perl|php|pwsh|powershell)$/ && args ~ / (-c|-e|-p|-r|--eval|--print|-Command) /))) {
        deny("reading .env files would put secrets in the transcript; use .env.example for variable names"); return
      }
      # Writes into run state or git internals. Redirects to /dev/null and fd copies are not writes;
      # cp only writes its destination (mv also removes its source, so it counts on both sides).
      t = segp; gsub(/\.orchestrator\/(reports|recon|logs)\/[^ "'\'')]*/, "", t)
      if (t ~ /(^|[ "'\''=\/(])\.orchestrator([\/ "'\'')]|$)/ || t ~ /(^|[ "'\''=])\.git(\/|[ "'\'')]|$)/) {
        if (p ~ /^(cp|install|ln|Copy-Item)$/) {
          u = clean(W[N]); gsub(/\\/, "/", u)
          if ((u ~ /(^|\/)\.orchestrator(\/|$)/ && u !~ /(^|\/)\.orchestrator\/(reports|recon|logs)\//) || u ~ /(^|\/)\.git(\/|$)/) { deny("agents may not modify run state under " orch "/ or git internals; report the problem instead"); return }
        } else {
          gsub(/[0-9]*>>? *\/dev\/null/, "", t); gsub(/[0-9]*>&[0-9-]+/, "", t); gsub(/[0-9]*> *(nul|NUL)( |$)/, " ", t)
          if (t ~ /(>|(^| )(tee|mv|rm|rmdir|touch|truncate|chmod|dd|rsync)( |$)|sed +-[a-zA-Z]*i|perl +-[a-zA-Z]*i|Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Move-Item|Rename-Item)/) {
            deny("agents may not modify run state under " orch "/ or git internals; report the problem instead"); return
          }
        }
      }
      # Recursive deletes outside the checkout.
      if (p ~ /^(rm|Remove-Item|rd|rmdir|del|ri)$/ && (fl ~ / -[a-zA-Z]*[rR][a-zA-Z]* / || fl ~ / (--recursive|-Recurse|-recurse) / || args ~ / \/[sS] /)) {
        for (j = i + 1; j <= N; j++) {
          u = clean(W[j]); gsub(/\\/, "/", u)
          if (u ~ /^-/ || u ~ /^\/[sSqQ]$/) continue
          if (outside(u)) { deny("recursive delete of " u " is outside what an orchestrate task may touch"); return }
        }
      }
      if (p == "find" && args ~ / (-delete|-exec +rm|-execdir +rm) /) {
        u = (i < N) ? clean(W[i + 1]) : "."; gsub(/\\/, "/", u); if (u ~ /^-/) u = "."
        if (u != "." && u != "./" && outside(u)) { deny("find -delete outside the checkout is not allowed"); return }
        if (args !~ / (-name|-iname|-path|-ipath|-regex|-iregex|-type|-newer|-mtime|-mmin|-empty) /) { deny("find -delete without a -name, -path or -type filter would delete everything under " u); return }
      }
    }
    { buf = buf (NR > 1 ? "\n" : "") $0 }
    END {
      EXTRA = ""; all = split_cmds(buf)
      for (round = 0; round < 3; round++) {
        nseg = split(all, SEGS, "\n")
        for (s = 1; s <= nseg; s++) check(SEGS[s])
        if (EXTRA == "") break
        t = EXTRA; EXTRA = ""; all = split_cmds(t)
      }
      if (D != "") print D; else if (A != "") print "ask:" A
    }')
}

cmd=${1:-help}
[ $# -gt 0 ] && shift
case $cmd in
  init|status|checkpoint|base|baseline|gate|verify|verify-all|slop|dispatch|review|accept|merge|finish|sync|pr-body|risk|quick)
    if r0=$(git rev-parse --show-toplevel 2>/dev/null); then
      ROOT_CACHE=$r0; PRIV_CACHE=$(priv "$r0") || PRIV_CACHE=""
      ensure_excludes "$r0"
      # Any command first restores files an interrupted oracle run left at their BASE version.
      for m0 in "$PRIV_CACHE"/oracle "$PRIV_CACHE"/oracle.*; do [ -f "$m0" ] && { oracle_recover "$r0"; break; }; done
    fi ;;
esac
case $cmd in
  init) cmd_init ${1+"$@"} ;;
  status) cmd_status ;;
  checkpoint) cmd_checkpoint ${1+"$@"} ;;
  base) cmd_base ${1+"$@"} ;;
  baseline) cmd_baseline ;;
  dispatch) cmd_dispatch ${1+"$@"} ;;
  gate) cmd_gate ${1+"$@"} ;;
  review) cmd_review ${1+"$@"} ;;
  accept) cmd_accept ${1+"$@"} ;;
  merge) cmd_merge ${1+"$@"} ;;
  verify) cmd_verify ${1+"$@"} ;;
  verify-all) cmd_verify_all ;;
  slop) cmd_slop ${1+"$@"} ;;
  risk) cmd_risk ${1+"$@"} ;;
  quick) cmd_quick ;;
  sync) cmd_sync ;;
  pr-body) cmd_pr_body ;;
  finish) cmd_finish ${1+"$@"} ;;
  hook-session) cmd_hook_session ;;
  hook-pretool) cmd_hook_pretool ;;
  help|-h|--help) usage ;;
  *) usage >&2; exit 2 ;;
esac

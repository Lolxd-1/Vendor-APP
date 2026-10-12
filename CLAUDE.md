<!-- orchestrate-kit:start -->
## Orchestrated builds
For features, refactors, migrations, or fixes that span several files or steps, use the `orchestrate` skill (`.claude/skills/orchestrate/SKILL.md`).
If `.orchestrator/STATE.md` exists, its `status:` is not `done`, and its `branch:` is the current branch, a run is in progress: load that skill and follow its Resume protocol before doing anything else. A STATE.md whose `branch:` is another branch belongs to someone else's run: ignore it.
Subagents: ignore this section and follow your dispatch.
<!-- orchestrate-kit:end -->

## Build notes (Windows, this PC)
- Kotlin/Android needs JDK 17: `JAVA_HOME=C:/Users/omkar/Downloads/quickverse-web-vendor-dashboard-dev/.tools/jdk17`,
  `ANDROID_HOME=C:/Users/omkar/AppData/Local/Android/Sdk` (the PATH java is 1.8; Android Studio's JBR is 25 — neither works).
- Kotlin unit tests: `cd android && ./gradlew testDebugUnitTest` (~1.5 min, no native C++ build).
- Native/APK builds hit the 260-char path limit: `subst V: <repo>`, set `QV_REAL_ROOT=<repo>`, build from `V:\android`,
  then `subst V: /D`. On low RAM use `--max-workers=1` (clang ran out of memory otherwise).
- The first `jest` run after `npm ci` can time out 2 tests on a cold Babel cache; a second run passes.
- Production (prd.quickverse.in) is live: no order actions, OTP, schedule or online/offline writes from tools or tests.

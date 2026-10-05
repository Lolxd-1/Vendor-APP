// Windows MAX_PATH workaround, used only when QV_REAL_ROOT is set (see README "Release APK").
// Native builds run from a short `subst` drive, but Metro resolves that drive back to the real
// path and then cannot find files named through the short one. Re-express every argument (and
// the working directory) through the real path, then hand over to the normal React Native CLI.
const path = require('path');

const realRoot = process.env.QV_REAL_ROOT;
const shortRoot = path.resolve(__dirname, '..');
const toReal = arg =>
  realRoot && arg.toLowerCase().startsWith(shortRoot.toLowerCase())
    ? path.join(realRoot, arg.slice(shortRoot.length))
    : arg;

if (realRoot) {
  process.argv = process.argv.map(toReal);
  process.chdir(realRoot);
}
// Required (not executed as main), react-native/cli.js only exports the community CLI: run it.
require(path.join(realRoot || shortRoot, 'node_modules', 'react-native', 'cli.js')).run();

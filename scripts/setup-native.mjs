// Generates the android/ and ios/ projects with the official React Native CLI and wires them to
// this repo's sources. Run once per machine: `npm run setup:native`. Same approach as RiderDNA.
// NOTE: written but not yet run on a machine with the Android/iOS toolchains.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scaffold = join(root, '.rn-scaffold');
const win = process.platform === 'win32';
const run = (cmd, args) => {
  const r = spawnSync(win ? cmd + '.cmd' : cmd, args, { cwd: root, stdio: 'inherit', shell: win });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (existsSync(join(root, 'android'))) {
  console.log('android/ already exists: setup was done. Use `npx react-native run-android`.');
  process.exit(0);
}

console.log('1/4 Generating a fresh React Native project…');
rmSync(scaffold, { recursive: true, force: true });
run('npx', ['--yes', '@react-native-community/cli@latest', 'init', 'BornDatenlabor', '--directory', '.rn-scaffold', '--skip-install', '--skip-git-init']);

console.log('2/4 Copying native projects and build config…');
for (const f of ['android', 'ios', 'babel.config.js', 'metro.config.js', '.watchmanconfig', 'Gemfile']) {
  if (existsSync(join(scaffold, f))) cpSync(join(scaffold, f), join(root, f), { recursive: true });
}

console.log('3/4 Merging package.json…');
const ours = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const gen = JSON.parse(readFileSync(join(scaffold, 'package.json'), 'utf8'));
// The generated project pins the React / React Native pair that belongs together; take those.
ours.dependencies = { ...ours.dependencies, ...gen.dependencies };
ours.devDependencies = { ...gen.devDependencies, ...ours.devDependencies };
delete ours.devDependencies['react-native'];
ours.scripts = { android: 'react-native run-android', ios: 'react-native run-ios', start: 'react-native start', ...ours.scripts };
writeFileSync(join(root, 'package.json'), JSON.stringify(ours, null, 2) + '\n');
rmSync(scaffold, { recursive: true, force: true });

console.log('4/4 Installing dependencies…');
run('npm', ['install']);
run('npm', ['install', '--save', '@react-native-async-storage/async-storage', '@react-native-documents/picker', 'react-native-fs']);

console.log('\nDone. Start with `npm run android` (emulator or USB device) or `npm run ios` on a Mac.');

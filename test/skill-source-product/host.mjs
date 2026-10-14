// Observer only: installs this package's packed artifact into an isolated
// official DSH profile through the normal plugin manager (pinned official npm
// peers), boots it and records what the live catalog serves, plus independent
// file (path, bytes digest, device/inode identity) and process observations
// around the skill load. Other modules are not installed here: they are
// represented by their published contract samples (run.mjs). It judges nothing.
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot';
import { INSTALL_ANCHOR, runProfile } from '@deepseek-ai/dsh/profile-boot';
import { runPluginCommand } from '@deepseek-ai/dsh-plugin-manager/operations';
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';

const [root, tarball] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const evidence = { pid: process.pid, host: require('@deepseek-ai/dsh/package.json').version, installs: [], catalog: null, observations: {} };
const save = () => writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');

// Observation failures propagate: an unreadable entry fails the run, it is never skipped.
async function tree(dir, out = {}) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name), rel = relative(root, path);
    if (rel === 'evidence.json' || rel === 'host.log' || rel === 'host-lifecycle.json') continue;
    const st = await lstat(path);
    if (item.isDirectory()) { out[rel + '/'] = `dir:${st.dev}:${st.ino}`; await tree(path, out); }
    else out[rel] = `${createHash('sha256').update(await readFile(path)).digest('hex')}:${st.size}:${st.dev}:${st.ino}`;
  }
  return out;
}
function processes() {
  const ps = spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' });
  if (ps.status !== 0) throw new Error(`process observation failed: ${ps.stderr}`);
  return ps.stdout.split('\n').map(l => l.trim()).filter(l => l.includes(root) && !/\bps\b -axo/.test(l)).sort();
}
const observe = async () => ({ files: await tree(root), processes: processes() });

const profileName = 'skills-source-product';
const profileDir = resolveProfileDir(profileName, process.env.DSH_HOME);
const pnpmBin = join(dirname(require.resolve('pnpm')), require('pnpm').bin.pnpm);
initProfile(profileDir, []);
await writeFile(join(profileDir, 'cordis.patch.yml'), "- insert: [{ id: skills, name: '@deepseek-ai/dsh-skill' }]\n");
const installed = await runPluginCommand({ profile: profileName, dir: profileDir, installAnchor: INSTALL_ANCHOR,
  cwd: process.cwd(), home: process.env.DSH_HOME }, ['add', tarball], { command: process.execPath, args: [pnpmBin],
  env: process.env, execution: 'service', outputBytes: 65536, onOutput: text => process.stdout.write(text) });
evidence.installs.push({ source: tarball, exitCode: installed.exitCode, timedOut: installed.timedOut ?? false, logPath: installed.logPath });
evidence.bundles = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8')).dsh?.profile?.bundles ?? [];
await save();

const { ctx, shutdown } = await runProfile({ profile: profileName,
  environment: createLaunchEnvironmentSnapshot([]), patchFiles: [], args: [] });
try {
  const skills = ctx.get('skills');
  evidence.skillsService = Boolean(skills);
  evidence.observations.beforeLoad = await observe();
  const loaded = skills ? await skills.get('hanaworlds-building', { cwd: process.cwd() }) : null;
  evidence.observations.afterLoad = await observe();
  evidence.catalog = loaded ? { provider: loaded.provider, source: loaded.source, path: loaded.path, content: loaded.content } : null;
  if (loaded) evidence.catalog.packedBody = await readFile(loaded.path, 'utf8');
  // A second read must be served from the same artifact with no extra effect.
  const again = skills ? await skills.get('hanaworlds-building', { cwd: process.cwd() }) : null;
  evidence.observations.afterSecondLoad = await observe();
  evidence.secondReadIdentical = Boolean(loaded && again && again.content === loaded.content && again.path === loaded.path);
} finally {
  await save();
  await shutdown.shutdown(0);
  await writeFile(join(root, 'host-lifecycle.json'), JSON.stringify({ pid: process.pid, profileDir,
    stop: { stoppedAt: new Date().toISOString(), method: 'await shutdown.shutdown(0)' } }, null, 2) + '\n');
}

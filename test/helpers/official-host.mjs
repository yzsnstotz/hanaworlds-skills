import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot';
import { INSTALL_ANCHOR, runProfile } from '@deepseek-ai/dsh/profile-boot';
import { runPluginCommand } from '@deepseek-ai/dsh-plugin-manager/operations';
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';

const [root, tarball] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const profileName = 'skills-source-check';
const profileDir = resolveProfileDir(profileName, process.env.DSH_HOME);
// pnpm's public root export is its manifest; its published bin field owns the
// executable path. It does not export the bin subpath as a module.
const pnpmManifest = require('pnpm');
const pnpmBin = join(dirname(require.resolve('pnpm')), pnpmManifest.bin.pnpm);
await access(pnpmBin);
console.log(JSON.stringify({ node: process.execPath, nodeVersion: process.version,
  pnpmBin, pnpmVersion: pnpmManifest.version, cache: process.env.npm_config_cache }));
// An independent profile with only the official registry. No model, credentials,
// world or application entry is mounted to prove source discovery.
initProfile(profileDir, []);
await writeFile(join(profileDir, 'cordis.patch.yml'),
  "- insert: [{ id: skills, name: '@deepseek-ai/dsh-skill' }]\n");
const installed = await runPluginCommand({ profile: profileName, dir: profileDir,
  installAnchor: INSTALL_ANCHOR, cwd: process.cwd(), home: process.env.DSH_HOME },
['add', tarball], {
  command: process.execPath, args: [pnpmBin],
  env: process.env, execution: 'service', outputBytes: 65536,
  onOutput: text => process.stdout.write(text),
});
assert.equal(installed.exitCode, 0, JSON.stringify(installed));
assert.notEqual(installed.timedOut, true);
const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'));
assert.ok(manifest.dsh.profile.bundles.includes('hanaworlds-skills'),
  'normal plugin manager must activate the installed bundle');
const startedAt = new Date().toISOString();
const { ctx, shutdown } = await runProfile({ profile: profileName,
  environment: createLaunchEnvironmentSnapshot([]), patchFiles: [], args: [] });
try {
  const skills = ctx.get('skills');
  assert.ok(skills, 'official live skill registry must be active');
  const options = { cwd: process.cwd() };
  const snapshot = await skills.snapshot(options);
  const listed = await skills.list(options);
  const loaded = await skills.get('hanaworlds-building', options);
  assert.equal(snapshot.complete, true);
  assert.deepEqual(listed, snapshot.skills);
  assert.deepEqual(listed.map(skill => skill.name), ['hanaworlds-building']);
  assert.ok(loaded, 'installed skill must be loadable from the same live catalog');
  assert.equal(loaded.provider, 'hanaworlds-skills');
  assert.equal(loaded.source, 'custom');
  const packageDir = dirname(createRequire(join(profileDir, 'package.json')).resolve('hanaworlds-skills/package.json'));
  assert.equal(loaded.path, join(packageDir, 'skills/hanaworlds-building/SKILL.md'));
  assert.notEqual(packageDir, fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, ''));
  const loader = ctx.get('loader');
  const mounts = [...loader.entries()].filter(entry => entry.options.id === 'hanaworlds-skills');
  assert.equal(mounts.length, 1, 'the composed Loader tree must have exactly one package mount');
  const [mount] = mounts;
  assert.equal(mount.options.name, '@deepseek-ai/dsh-skill-filesystem');
  assert.equal(mount.disabled, false);
  assert.ok(mount.fiber, 'official Loader must actually mount the filesystem entry');
  assert.equal(mount.fiber.state, 2, 'official filesystem fiber must be ACTIVE');
  const mountedConfig = mount.fiber.config;
  assert.deepEqual(mountedConfig.customSkillDirs, [join(packageDir, 'skills')]);
  assert.equal(mountedConfig.providerName, loaded.provider);
  assert.equal(mountedConfig.includeDefaultRoots, false);
  const packedBody = await readFile(loaded.path, 'utf8');
  const sourceBody = await readFile(new URL('../../skills/hanaworlds-building/SKILL.md', import.meta.url), 'utf8');
  assert.equal(packedBody, sourceBody);
  // Upstream deliberately separates frontmatter from the loaded Markdown body.
  assert.equal(loaded.content.trim(), sourceBody.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim());
  assert.match(loaded.content, /\{"action":"advance"\}/);
  assert.match(loaded.content, /\{"action":"advance","directBuild":/);
  const evidence = { host: require('@deepseek-ai/dsh/package.json').version,
    filesystem: require('@deepseek-ai/dsh-skill-filesystem/package.json').version,
    cwd: process.cwd(), profileDir, bundles: manifest.dsh.profile.bundles,
    catalog: listed, complete: snapshot.complete, provider: loaded.provider,
    path: loaded.path, bodyUnchanged: true,
    source: loaded.source, mount: { id: mount.id, name: mount.options.name, config: mountedConfig },
    manager: { exitCode: installed.exitCode, logPath: installed.logPath },
    node: process.execPath, nodeVersion: process.version, pnpmBin, pnpmVersion: pnpmManifest.version,
    skillSha256: createHash('sha256').update(packedBody).digest('hex') };
  await writeFile(join(root, 'live-catalog.json'), JSON.stringify(evidence, null, 2) + '\n');
} finally {
  await shutdown.shutdown(0);
  await writeFile(join(root, 'host-lifecycle.json'), JSON.stringify({ pid: process.pid,
    start: { startedAt, profileDir, node: process.execPath },
    stop: { stoppedAt: new Date().toISOString(), method: 'await shutdown.shutdown(0)' },
    until: 'catalog verification finished; Host disposed before helper exits' }, null, 2) + '\n');
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { initProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot';
import { INSTALL_ANCHOR, runProfile } from '@deepseek-ai/dsh/profile-boot';
import { runPluginCommand } from '@deepseek-ai/dsh-plugin-manager/operations';

const [root, tarball] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const profileName = 'skills-source-check';
const profileDir = resolveProfileDir(profileName, process.env.DSH_HOME);
// An independent profile with only the official registry. No model, credentials,
// world or application entry is mounted to prove source discovery.
initProfile(profileDir, []);
await writeFile(join(profileDir, 'cordis.patch.yml'),
  "- insert: [{ id: skills, name: '@deepseek-ai/dsh-skill' }]\n");
const installed = await runPluginCommand({ profile: profileName, dir: profileDir,
  installAnchor: INSTALL_ANCHOR, cwd: process.cwd(), home: process.env.DSH_HOME },
['add', tarball, '--ignore-scripts'], {
  command: process.execPath, args: [join(dirname(require.resolve('pnpm')), 'bin/pnpm.cjs')],
  env: process.env, execution: 'service', outputBytes: 65536,
  onOutput: text => process.stdout.write(text),
});
assert.equal(installed.exitCode, 0, JSON.stringify(installed));
assert.equal(installed.timedOut, false);
const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'));
assert.ok(manifest.dsh.profile.bundles.includes('hanaworlds-skills'),
  'normal plugin manager must activate the installed bundle');
const { ctx, shutdown } = await runProfile({ profile: profileName,
  environment: Object.freeze({}), patchFiles: [], args: [] });
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
  const packageDir = dirname(createRequire(join(profileDir, 'package.json')).resolve('hanaworlds-skills/package.json'));
  assert.equal(loaded.path, join(packageDir, 'skills/hanaworlds-building/SKILL.md'));
  assert.notEqual(packageDir, dirname(dirname(new URL(import.meta.url).pathname)));
  const packedBody = await readFile(loaded.path, 'utf8');
  const sourceBody = await readFile(new URL('../../skills/hanaworlds-building/SKILL.md', import.meta.url), 'utf8');
  assert.equal(packedBody, sourceBody);
  // Upstream deliberately separates frontmatter from the loaded Markdown body.
  assert.equal(loaded.content.trim(), sourceBody.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim());
  assert.match(loaded.content, /confirmedProposalRef/);
  assert.match(loaded.content, /\{"action":"build","proposal":/);
  const evidence = { host: require('@deepseek-ai/dsh/package.json').version,
    filesystem: require('@deepseek-ai/dsh-skill-filesystem/package.json').version,
    cwd: process.cwd(), profileDir, bundles: manifest.dsh.profile.bundles,
    catalog: listed, complete: snapshot.complete, provider: loaded.provider,
    path: loaded.path, bodyUnchanged: true,
    skillSha256: createHash('sha256').update(packedBody).digest('hex') };
  await writeFile(join(root, 'live-catalog.json'), JSON.stringify(evidence, null, 2) + '\n');
} finally {
  await shutdown.shutdown(0);
}

import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, realpath, writeFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const sourceRoot = fileURLToPath(new URL('..', import.meta.url));

test('packed skill is visible in the official alpha.2 host live catalog', async () => {
  assert.equal(require('@deepseek-ai/dsh-skill-filesystem/package.json').version, '0.2.1-alpha.2',
    'development supply must exercise the current official source provider');
  const root = await mkdtemp(join(process.env.HANA_SKILLS_TEST_DIR || tmpdir(), 'skills-official-host-'));
  try {
    await mkdir(join(root, 'outside-cwd'));
    const userconfig = join(root, 'user.npmrc');
    const globalconfig = join(root, 'global.npmrc');
    await writeFile(userconfig, '');
    await writeFile(globalconfig, '');
    assert.notEqual(userconfig, globalconfig);
    const cache = resolve(process.env.npm_config_cache || join(homedir(), '.cache/npm'));
    await mkdir(cache, { recursive: true });
    await access(cache, constants.W_OK);
    assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'official host needs Node 24 or newer');
    const npmCli = await realpath(join(dirname(process.execPath), 'npm'));
    const env = {
      PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`,
      DSH_HOME: join(root, 'dsh-home'),
      DSH_TELEMETRY_DISABLED: '1',
      npm_config_userconfig: userconfig,
      npm_config_globalconfig: globalconfig,
      npm_config_cache: cache,
    };
    await writeFile(join(root, 'runtime.json'), JSON.stringify({ node: process.execPath,
      nodeVersion: process.version, npmCli, cache, userconfig, globalconfig }, null, 2) + '\n');
    const packed = spawnSync(process.execPath, [npmCli, 'pack', '--json', '--pack-destination', root], {
      cwd: sourceRoot, env, encoding: 'utf8',
    });
    await writeFile(join(root, 'pack.log'), packed.stdout + packed.stderr);
    assert.equal(packed.status, 0, packed.stderr);
    const [{ filename, files }] = JSON.parse(packed.stdout);
    assert.deepEqual(files.map(file => file.path).sort(), [
      'LICENSE', 'README.md', 'cordis.patch.yml', 'package.json', 'skills/hanaworlds-building/SKILL.md',
    ], 'development Host and test implementations must not ship in the skill bundle');
    const boot = spawnSync(process.execPath, [fileURLToPath(new URL('./helpers/official-host.mjs', import.meta.url)),
      root, join(root, filename)], { cwd: join(root, 'outside-cwd'), env, encoding: 'utf8' });
    await writeFile(join(root, 'host.log'), boot.stdout + boot.stderr);
    assert.equal(boot.status, 0, boot.stdout + boot.stderr);
    const evidence = JSON.parse(await readFile(join(root, 'live-catalog.json'), 'utf8'));
    assert.equal(evidence.host, '0.2.1-alpha.2');
    assert.equal(evidence.filesystem, '0.2.1-alpha.2');
    assert.equal(evidence.provider, 'hanaworlds-skills');
    assert.equal(evidence.complete, true);
    assert.equal(evidence.bodyUnchanged, true);
    assert.ok(evidence.bundles.includes('hanaworlds-skills'));
    console.log(JSON.stringify({ officialHostEvidence: resolve(root), ...evidence }));
  } finally {
    if (!process.env.HANA_SKILLS_KEEP_TEST_ROOT) await rm(root, { recursive: true });
  }
});

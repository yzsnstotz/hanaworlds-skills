import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
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
    await writeFile(join(root, 'empty.npmrc'), '');
    const env = {
      PATH: process.env.PATH,
      DSH_HOME: join(root, 'dsh-home'),
      DSH_TELEMETRY_DISABLED: '1',
      npm_config_userconfig: join(root, 'empty.npmrc'),
      npm_config_globalconfig: join(root, 'empty.npmrc'),
      ...(process.env.npm_config_cache ? { npm_config_cache: process.env.npm_config_cache } : {}),
    };
    const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', root], {
      cwd: sourceRoot, env, encoding: 'utf8',
    });
    assert.equal(packed.status, 0, packed.stderr);
    const [{ filename }] = JSON.parse(packed.stdout);
    const boot = spawnSync(process.execPath, [fileURLToPath(new URL('./helpers/official-host.mjs', import.meta.url)),
      root, join(root, filename)], { cwd: join(root, 'outside-cwd'), env, encoding: 'utf8' });
    await writeFile(join(root, 'host.log'), boot.stdout + boot.stderr);
    assert.equal(boot.status, 0, boot.stdout + boot.stderr);
    const evidence = JSON.parse(await readFile(join(root, 'live-catalog.json'), 'utf8'));
    assert.equal(evidence.provider, 'hanaworlds-skills');
    assert.equal(evidence.complete, true);
    assert.equal(evidence.bodyUnchanged, true);
    assert.ok(evidence.bundles.includes('hanaworlds-skills'));
    console.log(JSON.stringify({ officialHostEvidence: resolve(root), ...evidence }));
  } finally {
    if (!process.env.HANA_SKILLS_KEEP_TEST_ROOT) await rm(root, { recursive: true });
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { interpolate } from '@deepseek-ai/cordis-plugin-loader';
import { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include';
import { test } from 'node:test';

test('installed package mounts through upstream interpolation and filesystem discovery', {
  skip: !process.env.HANA_SKILLS_INSTALL_ROOT,
}, async () => {
  const root = resolve(process.env.HANA_SKILLS_INSTALL_ROOT);
  const baseUrl = pathToFileURL(join(root, 'profile.yml')).href;
  const packageDir = dirname(createRequire(baseUrl).resolve('hanaworlds-skills/package.json'));
  assert.notEqual(packageDir, resolve('.'));
  assert.equal(await readFile(join(packageDir, 'skills/hanaworlds-building/SKILL.md'), 'utf8'),
    await readFile(new URL('../skills/hanaworlds-building/SKILL.md', import.meta.url), 'utf8'));
  const text = await readFile(join(packageDir, 'cordis.patch.yml'), 'utf8');
  assert.equal(text.trim().split('\n').length, 1);
  const patches = parse(text, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: __jsExpr => ({ __jsExpr }) }] });
  assert.equal(patches.length, 1);
  assert.ok(Array.isArray(patches[0].insert), 'upstream patch insertion requires an array of entries');
  const entries = applyEntryPatches([], patches, message => { throw new Error(message); });
  const [row] = interpolate({ baseUrl, process }, entries);
  assert.equal(row.name, '@deepseek-ai/dsh-skill-filesystem');
  assert.deepEqual(row.config.customSkillDirs, [join(packageDir, 'skills')]);
  const abort = new AbortController();
  let provider;
  // Only the host skill registry is simulated; interpolation, path resolution,
  // discovery and body loading run the unchanged installed upstream providers.
  const ctx = {
    get: () => undefined,
    skills: { registerProvider: factory => { provider = factory({ signal: abort.signal, invalidate() {} }); } },
    effect() {}, on() {}, logger: { warn: message => { throw new Error(String(message)); } },
  };
  const installedRequire = createRequire(baseUrl);
  const { apply } = await import(pathToFileURL(installedRequire.resolve(row.name)).href);
  apply(ctx, { ...row.config, watch: false });
  try {
    const candidates = await provider.list({ cwd: root, signal: abort.signal });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].name, 'hanaworlds-building');
    const loaded = await provider.get(candidates[0], { signal: abort.signal });
    assert.equal(loaded.provider, 'hanaworlds-skills');
    assert.equal(loaded.path, join(packageDir, 'skills/hanaworlds-building/SKILL.md'));
    assert.match(loaded.content, /confirmedProposalRef/);
    console.log(JSON.stringify({ packageDir, cwd: process.cwd(), path: loaded.path, provider: loaded.provider }));
  } finally { await provider.dispose(); abort.abort(); }
});

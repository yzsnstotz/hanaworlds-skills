// skills-03 product test: the installed skill, consumed by the installed peers'
// real public surfaces (C-skill skills-03). Run: node test/skill-source-product/run.mjs
// Red until the peers publish what the C-session supplier request (R-1..R-5) asks for.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
import { validate } from './schema.mjs';

const here = name => new URL(`./${name}`, import.meta.url);
const sourceRoot = fileURLToPath(new URL('../..', import.meta.url));
const json = async name => JSON.parse(await readFile(here(name), 'utf8'));
const structure = await json('c-skill.schema.json');
const { samples } = await json('c-skill-samples.json');
const corpus = (await json('creation-facts-corpus.json')).values;
const { peers } = await json('peers.json');

const root = await mkdtemp(join(process.env.HANA_SKILLS_TEST_DIR || tmpdir(), 'skills-source-product-'));
const npmCli = await realpath(join(dirname(process.execPath), 'npm'));
const cache = resolve(process.env.npm_config_cache || join(homedir(), '.cache/npm'));
await mkdir(join(root, 'outside-cwd'));
await writeFile(join(root, 'user.npmrc'), '');
await writeFile(join(root, 'global.npmrc'), '');
const env = { PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`, DSH_HOME: join(root, 'dsh-home'),
  DSH_TELEMETRY_DISABLED: '1', npm_config_userconfig: join(root, 'user.npmrc'),
  npm_config_globalconfig: join(root, 'global.npmrc'), npm_config_cache: cache };
const packed = spawnSync(process.execPath, [npmCli, 'pack', '--json', '--pack-destination', root], { cwd: sourceRoot, env, encoding: 'utf8' });
assert.equal(packed.status, 0, packed.stderr);
const [{ filename }] = JSON.parse(packed.stdout);
const host = spawnSync(process.execPath, [fileURLToPath(here('host.mjs')), root, join(root, filename)],
  { cwd: join(root, 'outside-cwd'), env, encoding: 'utf8', maxBuffer: 1 << 28 });
await writeFile(join(root, 'host.log'), host.stdout + host.stderr);
let ev = {};
try { ev = JSON.parse(await readFile(join(root, 'evidence.json'), 'utf8')); } catch {}
console.log(JSON.stringify({ skillSourceProductEvidence: root, hostExit: host.status }));

const TOOLS = ['hanaworlds_build', 'hanaworlds_context', 'hanaworlds_download_image', 'hanaworlds_image_material',
  'hanaworlds_proposal', 'hanaworlds_region_proposal', 'hanaworlds_write_methods'];
const content = ev.catalog?.content || '';
const examples = [...content.matchAll(/```json tool=(hanaworlds_[A-Za-z0-9_]+)\s*\n([\s\S]*?)\n```/g)].map(([, tool, body]) => ({ tool, input: JSON.parse(body) }));
const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x);
const fieldPath = (schema, path) => path.split('.').reduce((nodes, key) => nodes.flatMap(function expand(n) {
  if (!n || typeof n !== 'object') return [];
  return n.oneOf ? n.oneOf.flatMap(expand) : n.properties?.[key] ? [n.properties[key]] : [];
}), [schema]).length > 0;
const live = tool => { assert.ok(ev.registry?.[tool]?.parameters, `${tool} is not registered in the live tool registry`); return ev.registry[tool]; };
const gapText = () => (ev.gaps || []).join('\n');

test('peers are supplied by the normal plugin manager from their pinned published commits', () => {
  assert.equal(host.status, 0, `host exited ${host.status}; see ${join(root, 'host.log')}`);
  assert.deepEqual((ev.installs || []).map(i => i.source).slice(1), peers.map(p => p.source));
  for (const install of ev.installs) assert.equal(install.exitCode, 0, `install failed: ${install.source}`);
});

test('the assembled profile activates every entry on the official host', async () => {
  const log = await readFile(join(root, 'host.log'), 'utf8');
  assert.doesNotMatch(log, /disabling profile plugin row|did not activate/, 'an installed entry was disabled; see host.log');
  for (const [name, version] of Object.entries(ev.resolved || {})) assert.equal(version, ev.host, `${name} resolves ${version} in the profile, host is ${ev.host}`);
  assert.equal(ev.services?.hanaworldsWorldLifecycle, true, 'published world lifecycle service is not provided by the installed peers');
});

test('the installed skill is served by the live catalog', () => {
  assert.equal(ev.catalog?.provider, 'hanaworlds-skills');
  assert.ok(content.length > 0);
});

test('every tool the loaded skill names is registered live by the installed peers', () => {
  for (const name of TOOLS) {
    assert.ok(content.includes(name), `skill does not name ${name}`);
    assert.ok(live(name).output, `${name} has no live output schema`);
  }
  assert.deepEqual(Object.keys(ev.registry).sort(), TOOLS, 'skill names a tool outside the seven');
});

test('every input example in the loaded skill is accepted by the live tool schema', () => {
  assert.ok(examples.length > 0);
  for (const { tool, input } of examples) assert.deepEqual(validateJsonSchemaValue(live(tool).parameters, input), [], `${tool} rejects ${JSON.stringify(input)}`);
});

test('every output field the loaded skill reads exists in the live output schema', () => {
  const refs = [...content.matchAll(/`(hanaworlds_[A-Za-z0-9_]+)\.output\.([A-Za-z0-9_.]+)`/g)];
  assert.ok(refs.length > 0);
  for (const [, tool, path] of refs) assert.ok(fieldPath(live(tool).output, path), `${tool}.output.${path} not in live schema`);
});

test('the loaded skill grounds affected objects and creation facts in published fields only', () => {
  assert.ok(fieldPath(live('hanaworlds_build').output, 'affectedObjects'), 'C-session has not published affectedObjects (R-1)');
  assert.ok(fieldPath(live('hanaworlds_context').output, 'worldCreation'), 'C-session has not published worldCreation (R-4)');
  assert.match(content, /`hanaworlds_build\.output\.affectedObjects`/);
  assert.match(content, /`hanaworlds_context\.output\.worldCreation`/);
  assert.doesNotMatch(content, /Stop, say which, and ask the player/, 'ungrounded "say which" must be replaced');
});

test('continue is a declared live input and model-forged consent is refused', () => {
  const params = live('hanaworlds_build').parameters;
  assert.deepEqual(validateJsonSchemaValue(params, { action: 'continue' }), [], 'C-session has not published action continue (R-2)');
  for (const forged of [{ confirmed: true }, { affectedObjectRefs: ['x'] }, { confirmedProposalRef: 'x' }, { sessionRef: 'x' }, { turnRevision: 'x' }]) {
    assert.notDeepEqual(validateJsonSchemaValue(params, { action: 'continue', ...forged }), [], `continue accepts ${Object.keys(forged)}`);
  }
  assert.match(content, /```json tool=hanaworlds_build\s*\n\{"action":"continue"\}\n```/, 'skill continue example must carry only the action');
});

test('every C-skill sample matches the local C-skill structure, and malformed ones do not', () => {
  assert.equal(samples.length, 33);
  for (const s of samples) {
    assert.deepEqual(validate(structure.request, s.request), [], `${s.id} request`);
    assert.deepEqual(validate(structure.response, s.response), [], `${s.id} response`);
    assert.equal(s.response.requestId, s.request.requestId, `${s.id} correlation`);
    assert.ok((s.response.result === null) !== (s.response.error === null), `${s.id}: exactly one of result and error`);
  }
  const base = samples[0];
  assert.notDeepEqual(validate(structure.response, { ...base.response, extra: 1 }), []);
  assert.notDeepEqual(validate(structure.request, { ...base.request, hostContext: { ...base.request.hostContext, sessionRef: undefined } }), []);
  assert.notDeepEqual(validate(structure.response, { ...base.response, result: { kind: 'reply', text: 't', worldCreation: { creationFacts: 1, x: 1 } } }), []);
  assert.deepEqual([...new Set(samples.map(s => s.response.result?.kind ?? 'error'))].sort(), ['clarification', 'error', 'proposal', 'reply', 'tool_call']);
});

test('every C-skill tool_call sample is documented by the loaded skill and accepted by the live tool', () => {
  const calls = samples.filter(s => s.response.result?.kind === 'tool_call').map(s => s.response.result.call);
  assert.equal(calls.length, 12);
  for (const { tool, input } of calls) {
    assert.ok(examples.some(e => e.tool === tool && e.input.action === input.action), `loaded skill has no ${tool} ${input.action} example`);
    assert.deepEqual(validateJsonSchemaValue(live(tool).parameters, input), [], `${tool} rejects ${JSON.stringify(input)}`);
  }
});

test('every C-skill sample is grounded by its real run through a published Workshop session entry', () => {
  assert.ok(ev.sessionEntry, `no real session entry was available:\n${gapText()}`);
  for (const s of samples) {
    const g = ev.grounding?.[s.id];
    assert.ok(g, `${s.id}: grounding run missing`);
    if (s.grounding.kind === 'execute') {
      const outcome = g.isError ? g.error?.code : g.value?.error?.code ?? (s.grounding.expect === 'pending' ? (g.value?.result?.confirmed === false ? 'pending' : 'not-pending') : 'success');
      assert.equal(outcome, s.grounding.expect, `${s.id}: ${JSON.stringify(g)}`);
    }
    if (s.grounding.kind === 'affected') {
      const names = (g.value?.affectedObjects || []).map(o => o.displayName);
      if (s.grounding.expect === 'names') for (const name of s.grounding.names) assert.ok(names.includes(name) && s.response.result.question.includes(name), `${s.id}: ${name} not reported by the tool`);
      else assert.equal(g.value?.affectedObjects, undefined, `${s.id}: list unexpectedly present`);
    }
    if (s.grounding.kind === 'creation') {
      const expected = s.grounding.corpusIndex === null ? null : { creationFacts: corpus[s.grounding.corpusIndex] };
      assert.equal(canon(g.value?.result?.worldCreation), canon(expected), `${s.id}: tool worldCreation differs`);
      assert.equal(canon(s.response.result.worldCreation), canon(expected), `${s.id}: sample reply differs`);
    }
  }
});

test('creationFacts: lifecycle v2 consumed correctly, values verbatim, zero extra world/journal/native/session effects', () => {
  assert.equal(ev.creationFacts?.length, corpus.length, `corpus not executed:\n${gapText()}`);
  for (const record of ev.lifecycle) {
    assert.equal(record.request.contractVersion, 'world-lifecycle/v2');
    assert.ok(record.correlated, `${record.request.requestId}: response not correlated ${JSON.stringify(record.response ?? record.rejected)}`);
  }
  for (const row of ev.creationFacts) {
    assert.ok(row.created?.worldId && row.created?.worldRef, `${row.templateId}: create failed`);
    assert.equal(canon(row.created.creationFacts), canon(row.expected), `${row.templateId}: create changed creationFacts`);
    assert.equal(row.worldsAfter?.length, row.worldsBefore?.length + 1, `${row.templateId}: create must add exactly one world`);
    assert.ok(row.launched?.connectionRef, `${row.templateId}: launch by worldId failed`);
    assert.equal(row.stopped?.state, 'STOPPED', `${row.templateId}: stop by connectionRef failed`);
    assert.ok(row.skillBoundary, `${row.templateId}: skill-boundary read not executed (R-4/R-5)`);
    assert.equal(canon(row.skillBoundary.result?.worldCreation), canon({ creationFacts: row.expected }), `${row.templateId}: not delivered verbatim`);
    assert.equal(canon(row.afterSkillBoundary), canon(row.afterLaunch), `${row.templateId}: reading creationFacts changed files or processes`);
  }
});

test('OTHER_OBJECTS_AFFECTED is enforced and continue runs only on a decision bound to the current user action', () => {
  const a = ev.affected;
  assert.ok(a, `affected-object scenario not executed:\n${gapText()}`);
  for (const step of ['directDig', 'applyDig']) {
    assert.equal(a[step]?.value?.error?.code, 'OTHER_OBJECTS_AFFECTED', step);
    assert.equal(a[step].value.error.mutationState, 'NONE', step);
    assert.deepEqual(a[step].value.affectedObjects, a.registryObjectA, `${step}: names must come from the registry`);
  }
  for (const step of ['continueUndecided', 'continueStale']) assert.equal(a[step]?.value?.error?.code, 'INTENT_UNCONFIRMED', step);
  assert.ok(a.continueForged?.isError, 'forged continue must be refused');
  for (const step of ['afterDirectDig', 'afterApplyDig', 'afterRefusals', 'afterStale']) assert.equal(canon(a[step]), canon(a.beforeDig), `${step} changed state`);
  assert.equal(a.continueCurrent?.value?.result?.outcome?.outcome, 'VERIFIED');
  assert.notEqual(canon(a.afterContinue), canon(a.beforeDig), 'verified continue must be independently observable');
});

test.after(async () => { if (!process.env.HANA_SKILLS_KEEP_TEST_ROOT) await rm(root, { recursive: true, force: true }); });

// skills-03 product test: the installed skill against the installed peers'
// real public tools (C-skill skills-03 §2–§5). Run: node test/skill-source-product/run.mjs
// Stays red, naming each gap, until the peers publish what C-skill §3–§5 needs.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';

const sourceRoot = fileURLToPath(new URL('../..', import.meta.url));
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
const host = spawnSync(process.execPath, [fileURLToPath(new URL('./host.mjs', import.meta.url)), root, join(root, filename),
  join(sourceRoot, 'product-peers.json')], { cwd: join(root, 'outside-cwd'), env, encoding: 'utf8' });
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
const ok = step => step && !step.thrown && step.value && step.value.isError !== true;
const body = step => step?.value?.value;
const fieldPath = (schema, path) => path.split('.').reduce((nodes, key) => nodes.flatMap(function expand(n) {
  if (!n || typeof n !== 'object') return [];
  const alts = n.oneOf || n.anyOf || n.allOf;
  return alts ? alts.flatMap(expand) : n.properties?.[key] ? [n.properties[key]] : [];
}), [schema]).length > 0;

test('product peers are declared and installed by the normal plugin manager', () => {
  assert.equal(host.status, 0, `host exited ${host.status}; see ${join(root, 'host.log')}`);
  assert.deepEqual(ev.gaps, [], `peer gaps (C-skill skills-03 §5 R-5):\n${(ev.gaps || []).join('\n')}`);
  for (const install of ev.installs) assert.equal(install.exitCode, 0, `install failed: ${install.source}`);
});

test('the installed skill is served by the live catalog', () => {
  assert.equal(ev.catalog?.provider, 'hanaworlds-skills');
  assert.ok(content.length > 0);
});

test('every tool the loaded skill names is registered live with its published schemas', () => {
  for (const name of TOOLS) {
    assert.ok(content.includes(name), `skill does not name ${name}`);
    assert.ok(ev.registry?.[name], `${name} is not registered in the live tool registry`);
    assert.ok(ev.registry[name].output, `${name} has no live output schema`);
  }
  assert.deepEqual(Object.keys(ev.registry || {}).sort(), TOOLS, 'skill names a tool outside the seven');
});

test('every input example in the loaded skill is accepted by the live tool schema', () => {
  assert.ok(examples.length > 0);
  for (const { tool, input } of examples) {
    assert.ok(ev.registry?.[tool]?.parameters, `${tool} has no live input schema`);
    assert.deepEqual(validateJsonSchemaValue(ev.registry[tool].parameters, input), [], `${tool} rejects ${JSON.stringify(input)}`);
  }
});

test('every output field the loaded skill reads exists in the live output schema', () => {
  const refs = [...content.matchAll(/`(hanaworlds_[A-Za-z0-9_]+)\.output\.([A-Za-z0-9_.]+)`/g)];
  assert.ok(refs.length > 0);
  for (const [, tool, path] of refs) assert.ok(fieldPath(ev.registry?.[tool]?.output, path), `${tool}.output.${path} not in live schema`);
});

test('the skill reads affected objects and creation facts only from declared fields and continues only via the continue action', () => {
  assert.match(content, /`hanaworlds_build\.output\.affectedObjects`/, 'skill must name affected objects from the tool output');
  assert.match(content, /```json tool=hanaworlds_build\s*\n\{"action":"continue"\}\n```/, 'continue example must carry only the action');
  assert.match(content, /`hanaworlds_context\.output\.worldCreation`/, 'skill must read creation facts from the declared field');
  assert.doesNotMatch(content, /Stop, say which, and ask the player/, 'ungrounded "say which" must be replaced');
});

test('model-forged consent on continue is refused by the live schema', () => {
  const params = ev.registry?.hanaworlds_build?.parameters;
  assert.ok(params, 'hanaworlds_build is not registered in the live tool registry');
  assert.deepEqual(validateJsonSchemaValue(params, { action: 'continue' }), [], 'continue must be a declared input');
  for (const forged of [{ confirmed: true }, { affectedObjectRefs: ['x'] }, { confirmedProposalRef: 'x' }, { sessionRef: 'x' }, { turnRevision: 'x' }]) {
    assert.notDeepEqual(validateJsonSchemaValue(params, { action: 'continue', ...forged }), [], `continue accepts ${Object.keys(forged)}`);
  }
});

test('creationFacts of every JSON root form reach hanaworlds_context unchanged with zero extra side effects', () => {
  assert.equal(ev.creationFacts?.length, 13, 'corpus was not executed through the public entries');
  for (const row of ev.creationFacts) {
    const s = row.steps;
    assert.ok(s.create?.value?.worldRef, `${row.templateId}: create failed ${JSON.stringify(s.create)}`);
    assert.equal(canon(s.create.value.creationFacts), canon(row.expected), `${row.templateId}: runtime create changed creationFacts`);
    assert.equal(s.before?.value?.worlds?.length, s.worldsBefore?.value?.length + 1, `${row.templateId}: create must add exactly one world`);
    assert.ok(ok(s.context), `${row.templateId}: context read failed ${JSON.stringify(s.context)}`);
    const wc = body(s.context).worldCreation;
    assert.ok(wc && Object.hasOwn(wc, 'creationFacts'), `${row.templateId}: worldCreation.creationFacts absent`);
    assert.equal(canon(wc.creationFacts), canon(row.expected), `${row.templateId}: creationFacts not delivered verbatim`);
    assert.equal(typeof wc.creationFacts, typeof row.expected, `${row.templateId}: root type changed`);
    assert.equal(canon(s.after?.value), canon(s.before?.value), `${row.templateId}: reading creationFacts changed sessions, worlds or undo state`);
  }
});

test('OTHER_OBJECTS_AFFECTED names the real affected object and writes nothing, on direct build and on apply', () => {
  const s = ev.affected?.steps;
  assert.ok(s, 'affected-object scenario was not executed through the public entries');
  assert.ok(ok(s.applyA) && body(s.applyA).outcome?.outcome === 'VERIFIED', `object A not built: ${JSON.stringify(s.applyA)}`);
  const before = new Set((s.objectsBefore?.value || []).map(o => o.objectRef));
  const created = (s.objectsWithA?.value || []).filter(o => !before.has(o.objectRef));
  assert.equal(created.length, 1, 'building A must register exactly one object');
  for (const [name, step, obs] of [['build', s.directDig, s.afterDirectDig], ['apply', s.applyDig, s.afterApplyDig]]) {
    const response = body(step) ?? step?.value?.error;
    assert.equal(response?.error?.code ?? response?.code, 'OTHER_OBJECTS_AFFECTED', `${name}: ${JSON.stringify(step)}`);
    assert.equal(response?.error?.mutationState ?? response?.mutationState, 'NONE');
    assert.deepEqual(response?.affectedObjects, created.map(o => ({ objectRef: o.objectRef, displayName: o.displayName })),
      `${name}: affectedObjects must equal the registry's real object`);
    assert.equal(canon(obs?.value), canon(s.beforeDig?.value), `${name}: refusal changed world, session or undo state`);
  }
});

test('continue runs only on a decision bound to the current user action', () => {
  const s = ev.affected?.steps;
  assert.ok(s, 'affected-object scenario was not executed through the public entries');
  const code = step => (body(step) ?? step?.value?.error)?.error?.code ?? (body(step) ?? step?.value?.error)?.code;
  assert.equal(code(s.continueUndecided), 'INTENT_UNCONFIRMED', `continue without a decision: ${JSON.stringify(s.continueUndecided)}`);
  assert.ok(s.continueForged?.thrown || s.continueForged?.value?.isError, 'forged continue input must be refused');
  assert.equal(canon(s.afterRefusals?.value), canon(s.beforeDig?.value), 'refused continue changed state');
  assert.equal(code(s.continueStale), 'INTENT_UNCONFIRMED', `stale-turn decision authorized continue: ${JSON.stringify(s.continueStale)}`);
  assert.equal(canon(s.afterStale?.value?.worlds), canon(s.beforeDig?.value?.worlds), 'stale continue changed worlds');
  assert.ok(ok(s.currentDecision), `host could not record the current decision: ${JSON.stringify(s.currentDecision)}`);
  assert.ok(ok(s.continueCurrent) && body(s.continueCurrent).outcome?.outcome === 'VERIFIED', `current continue: ${JSON.stringify(s.continueCurrent)}`);
  assert.notEqual(canon(s.afterContinue?.value?.undo), canon(s.beforeDig?.value?.undo), 'verified continue must be observable in undo status');
});

test.after(async () => { if (!process.env.HANA_SKILLS_KEEP_TEST_ROOT) await rm(root, { recursive: true, force: true }); });

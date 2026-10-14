// skills-03 test: this module's own artifact for real (packed, installed by the
// official plugin manager, served by the live catalog, independently observed),
// its own C-skill definition (local structure, injection boundary, samples), and
// external modules only through their published contract samples.
// Real model calls, the real assembled Loader and the full product are segment acceptance.
// Run: node test/skill-source-product/run.mjs
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validate } from './schema.mjs';

const here = name => new URL(`./${name}`, import.meta.url);
const sourceRoot = fileURLToPath(new URL('../..', import.meta.url));
const json = async name => JSON.parse(await readFile(here(name), 'utf8'));
const structure = await json('c-skill.schema.json');
const { samples } = await json('c-skill-samples.json');
const external = (await json('c-session-samples.json')).samples;
const corpus = (await json('creation-facts-corpus.json')).values;
const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x);

// ---- own artifact, real ----
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
const ev = JSON.parse(await readFile(join(root, 'evidence.json'), 'utf8'));
console.log(JSON.stringify({ skillSourceProductEvidence: root, hostExit: host.status, hostPid: ev.pid }));
const content = ev.catalog?.content || '';
const examples = [...content.matchAll(/```json tool=(hanaworlds_[A-Za-z0-9_]+)\s*\n([\s\S]*?)\n```/g)].map(([, tool, body]) => ({ tool, input: JSON.parse(body) }));
const HOST_INJECTED = ['sessionRef', 'turnRef', 'turnRevision', 'worldRef', 'localContext', 'hostContext', 'connectionRef',
  'selectionRevision', 'intentAuthorization', 'catalogueFacts', 'confirmed', 'clear', 'authorization', 'affectedObjectRefs'];
const keysDeep = v => v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...keysDeep(x)]) : [];

test('own artifact: the packed skill installs, activates and is served unchanged by the live catalog', () => {
  assert.equal(host.status, 0, `host exited ${host.status}; see ${join(root, 'host.log')}`);
  assert.deepEqual(ev.installs.map(i => i.exitCode), [0]);
  assert.ok(ev.bundles.includes('hanaworlds-skills'));
  assert.doesNotMatch(host.stdout + host.stderr, /disabling profile plugin row|did not activate/);
  assert.equal(ev.skillsService, true);
  assert.equal(ev.catalog?.provider, 'hanaworlds-skills');
  assert.equal(ev.catalog.packedBody, readFileSync(join(sourceRoot, 'skills/hanaworlds-building/SKILL.md'), 'utf8'));
  assert.equal(ev.secondReadIdentical, true);
});

test('own artifact: loading and re-reading the skill has zero extra file or process effects; identities are kept', () => {
  const { beforeLoad, afterLoad, afterSecondLoad } = ev.observations;
  assert.ok(beforeLoad && afterLoad && afterSecondLoad, 'an observation is missing: observation failure is a failure');
  assert.ok(Object.keys(beforeLoad.files).length > 0);
  assert.deepEqual(afterLoad.files, beforeLoad.files, 'skill load changed files, content or file identity');
  assert.deepEqual(afterSecondLoad.files, beforeLoad.files, 'second read changed files, content or file identity');
  assert.deepEqual(afterLoad.processes, beforeLoad.processes, 'skill load started or stopped a process');
  assert.deepEqual(afterSecondLoad.processes, beforeLoad.processes);
});

test('own artifact: the host stopped cleanly; its PID is gone and its logs are kept', async () => {
  const life = JSON.parse(await readFile(join(root, 'host-lifecycle.json'), 'utf8'));
  assert.equal(life.pid, ev.pid);
  assert.throws(() => process.kill(ev.pid, 0), { code: 'ESRCH' }, `host PID ${ev.pid} is still alive`);
  assert.ok(ev.installs[0].logPath && readFileSync(ev.installs[0].logPath, 'utf8').length > 0, 'install log missing');
  assert.ok(readFileSync(join(root, 'host.log'), 'utf8').length > 0);
});

test('own module carries no contract package: lint and tests use the local structure', () => {
  const pkg = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'));
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) assert.equal(pkg[field]?.['hanaworlds-contracts'], undefined, `${field} still lists hanaworlds-contracts`);
  for (const dir of ['tools', 'test']) for (const f of readdirSync(join(sourceRoot, dir)).filter(f => f.endsWith('.mjs'))) {
    assert.doesNotMatch(readFileSync(join(sourceRoot, dir, f), 'utf8'), /from ['"]hanaworlds-contracts|resolve\(['"]hanaworlds-contracts/, `${dir}/${f} imports the contract package`);
  }
});

// ---- own C-skill definition ----
test('C-skill: every sample matches the local structure, correlates, and malformed ones are refused', () => {
  assert.equal(samples.length, 33);
  for (const s of samples) {
    assert.deepEqual(validate(structure.request, s.request), [], `${s.id} request`);
    assert.deepEqual(validate(structure.response, s.response), [], `${s.id} response`);
    assert.equal(s.response.contractVersion, s.request.contractVersion);
    assert.equal(s.response.requestId, s.request.requestId);
    assert.ok((s.response.result === null) !== (s.response.error === null), `${s.id}: exactly one of result and error`);
  }
  const b = samples[0];
  assert.notDeepEqual(validate(structure.response, { ...b.response, extra: 1 }), []);
  assert.notDeepEqual(validate(structure.request, { ...b.request, hostContext: { ...b.request.hostContext, sessionRef: undefined } }), []);
  assert.notDeepEqual(validate(structure.response, { ...b.response, result: { kind: 'reply', text: 't', worldCreation: { creationFacts: 1, x: 1 } } }), []);
  assert.deepEqual([...new Set(samples.map(s => s.response.result?.kind ?? 'error'))].sort(), ['clarification', 'error', 'proposal', 'reply', 'tool_call']);
});

test('C-skill injection boundary: no model-side tool input carries host-injected identity, consent or facts', () => {
  const inputs = [...samples.filter(s => s.response.result?.kind === 'tool_call').map(s => s.response.result.call.input), ...examples.map(e => e.input)];
  assert.ok(inputs.length >= 12 + 1);
  for (const input of inputs) for (const key of keysDeep(input)) assert.ok(!HOST_INJECTED.includes(key), `model input carries host field ${key}: ${JSON.stringify(input)}`);
  for (const s of samples) assert.deepEqual(Object.keys(s.request.hostContext).sort(), ['localContext', 'sessionRef', 'turnRef', 'turnRevision'], `${s.id}: hostContext shape`);
});

test('model rules in the loaded skill: real names only, current-turn continue only, creation facts verbatim', () => {
  assert.match(content, /`hanaworlds_build\.output\.affectedObjects`/, 'skill must name affected objects from the tool output');
  assert.doesNotMatch(content, /Stop, say which, and ask the player/, 'ungrounded "say which" must be replaced');
  assert.match(content, /```json tool=hanaworlds_build\s*\n\{"action":"continue"\}\n```/, 'continue example must carry only the action');
  assert.match(content, /`hanaworlds_context\.output\.worldCreation`/, 'skill must read creation facts from the declared field');
  for (const s of samples.filter(s => s.response.result?.kind === 'tool_call')) {
    const { tool, input } = s.response.result.call;
    assert.ok(examples.some(e => e.tool === tool && e.input.action === input.action), `loaded skill documents no ${tool} ${input.action}`);
  }
});

// ---- external modules, through their published contract samples only ----
const match = g => external.filter(x => x.tool === g.tool && x.request?.input?.action === g.input?.action);
const outcome = x => x.response.error?.code ?? (x.response.result?.confirmed === false ? 'pending' : 'success');

test('every C-skill sample is grounded by a published C-session/C-painter contract sample', () => {
  const missing = [];
  for (const s of samples) {
    const g = s.grounding;
    if (g.kind === 'none') continue;
    if (g.kind === 'execute' && !match(g).some(x => outcome(x) === g.expect)) missing.push(`${s.id}: ${g.tool} ${g.input.action} → ${g.expect}`);
    if (g.kind === 'affected') {
      const refusals = external.filter(x => x.tool === 'hanaworlds_build' && x.response.error?.code === 'OTHER_OBJECTS_AFFECTED');
      const ok = g.expect === 'names'
        ? refusals.some(x => g.names.every(n => (x.response.affectedObjects || []).some(o => o.displayName === n) && s.response.result.question.includes(n)))
        : refusals.some(x => x.response.affectedObjects === undefined);
      if (!ok) missing.push(`${s.id}: OTHER_OBJECTS_AFFECTED sample ${g.expect === 'names' ? 'with affectedObjects ' + g.names : 'without a list'}`);
    }
    if (g.kind === 'creation') {
      const want = g.corpusIndex === null ? null : { creationFacts: corpus[g.corpusIndex] };
      const ok = external.some(x => x.tool === 'hanaworlds_context' && Object.hasOwn(x.response.result || {}, 'worldCreation') && canon(x.response.result.worldCreation) === canon(want));
      if (!ok) missing.push(`${s.id}: hanaworlds_context read with worldCreation ${canon(want)}`);
      assert.equal(canon(s.response.result.worldCreation), canon(want), `${s.id}: reply does not echo the value verbatim`);
    }
  }
  assert.deepEqual(missing, [], `published contract samples missing for:\n${missing.join('\n')}`);
});

test('continue is grounded: current-turn decision verified, missing/stale decision and forged input refused', () => {
  const cont = external.filter(x => x.tool === 'hanaworlds_build' && x.request?.input?.action === 'continue');
  assert.ok(cont.some(x => x.response.result?.outcome?.outcome === 'VERIFIED'), 'no published continue success');
  assert.ok(cont.some(x => x.response.error?.code === 'INTENT_UNCONFIRMED'), 'no published continue INTENT_UNCONFIRMED');
  assert.ok(cont.some(x => x.response.error?.code === 'OTHER_OBJECTS_AFFECTED' && x.response.affectedObjects?.length), 'no published continue with a changed affected set');
  for (const x of cont) assert.deepEqual(Object.keys(x.request.input), ['action'], 'continue input must be exactly the action');
});

test.after(async () => { if (!process.env.HANA_SKILLS_KEEP_TEST_ROOT) await rm(root, { recursive: true, force: true }); });

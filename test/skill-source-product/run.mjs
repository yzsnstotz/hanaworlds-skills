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
const externalDoc = await json('c-session-samples.json');
const external = externalDoc.samples;
const defs = (await json('c-session-types.json')).definitions;
const modelCases = externalDoc.modelCases;
const painterImage = await json('c-painter-image.json');
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
const byId = Object.fromEntries([...external, ...modelCases].map(c => [c.id, c]));
const images = Object.fromEntries(painterImage.examples.map(x => [x.id, x]));
const v = (schema, value) => validate(schema, value, defs);
const zero = c => c.effects && Object.values(c.effects).every(n => n === 0);
const visible = c => JSON.parse(c.modelMessage.content[0].text.replace(/^Error: /, ''));
const inputOf = c => c.request?.modelInput ?? c.modelInput;
const hostOf = c => { const h = c.hostContext ?? c.host; return { sessionRef: h.sessionRef, turnRef: h.turnRef, turnRevision: h.turnRevision, localContext: h.localContext }; };
const TOOL_INPUT = { hanaworlds_context: { $ref: '#/definitions/ContextModelInput' }, hanaworlds_proposal: { $ref: '#/definitions/ProposalModelInput' },
  hanaworlds_region_proposal: { $ref: '#/definitions/RegionProposalModelInput' }, hanaworlds_build: { $ref: '#/definitions/CompatibleBuildModelInput' },
  hanaworlds_write_methods: { $ref: '#/definitions/WriteMethodsModelInput' }, hanaworlds_download_image: { $ref: '#/definitions/DownloadImageModelInput' },
  hanaworlds_image_material: painterImage.parameters };
const toolCall = (tool, input) => ({ contractVersion: 'skill/v1', requestId: 'x', result: { kind: 'tool_call', call: { tool, input } }, error: null });
const DECISION_FIELDS = ['decisionRevision', 'messageRef', 'messageDigest', 'affectedSetDigest', 'targetFactsDigest', 'analysisDigest', 'sourceDecision', 'decisionKind'];
const TYPED_FIELDS = ['imageBytes', 'bytes', 'catalogue', 'currentConnection', 'materialSources', 'intent', 'safetyProfile', 'sourceMessage'];

test('C-skill: every sample matches the local structure over the published types; malformed and non-model calls are refused', () => {
  assert.equal(samples.length, 57);
  for (const s of samples) {
    assert.deepEqual(v(structure.request, s.request), [], `${s.id} request`);
    assert.deepEqual(v(structure.response, s.response), [], `${s.id} response`);
    assert.equal(s.response.contractVersion, s.request.contractVersion);
    assert.equal(s.response.requestId, s.request.requestId);
    assert.ok((s.response.result === null) !== (s.response.error === null), `${s.id}: exactly one of result and error`);
  }
  const b = samples[0];
  assert.notDeepEqual(v(structure.response, { ...b.response, extra: 1 }), []);
  assert.notDeepEqual(v(structure.request, { ...b.request, hostContext: { ...b.request.hostContext, sessionRef: undefined } }), []);
  assert.notDeepEqual(v(structure.response, { ...b.response, result: { kind: 'reply', text: 't', worldCreation: { creationFacts: 1, x: 1 } } }), []);
  assert.deepEqual([...new Set(samples.map(s => s.response.result?.kind ?? 'error'))].sort(), ['clarification', 'error', 'proposal', 'reply', 'tool_call']);
  for (const [tool, input] of [['hanaworlds_build', { action: 'continue' }], ['hanaworlds_build', { action: 'apply', confirmedProposalRef: 'x' }], ['hanaworlds_build', { action: 'redo' }],
    ['hanaworlds_context', { action: 'read', sessionRef: 'x' }], ['hanaworlds_image_material', images['forged-typed'].modelInput], ['hanaworlds_image_material', images['forged-world'].modelInput]]) {
    assert.notDeepEqual(v(structure.response, toolCall(tool, input)), [], `local structure admits ${tool} ${JSON.stringify(input)}`);
  }
});

test('C-skill injection: hostContext equals the official Host values of its grounding case; no model input carries host, decision or typed facts', () => {
  for (const s of samples) {
    const g = s.grounding, c = g.cases?.length ? byId[g.cases[0]] : g.images ? byId['model-images-current'] : byId['model-clear-direct'];
    assert.ok(c, `${s.id}: grounding case missing`);
    assert.equal(canon(s.request.hostContext), canon(hostOf(c)), `${s.id}: hostContext is not the Host's session/turn/localContext of ${c.id}`);
  }
  const inputs = [...samples.filter(s => s.response.result?.kind === 'tool_call').map(s => s.response.result.call.input), ...examples.map(e => e.input)];
  assert.ok(inputs.length >= 25);
  for (const input of inputs) for (const key of keysDeep(input)) assert.ok(![...HOST_INJECTED, ...DECISION_FIELDS, ...TYPED_FIELDS].includes(key), `model input carries ${key}: ${JSON.stringify(input)}`);
  const scoped = byId['host-model-supplied-scope'];
  assert.equal(scoped.requestAdmitted, false); assert.equal(scoped.response.error.code, 'INTENT_UNCONFIRMED'); assert.ok(zero(scoped));
});

test('model rules in the loaded skill follow the published model inputs, keep direct build and image material, and ground every rule', () => {
  assert.ok(examples.length > 0);
  for (const { tool, input } of examples) {
    assert.ok(TOOL_INPUT[tool], `loaded skill names a non-model tool call: ${tool}`);
    assert.deepEqual(v(TOOL_INPUT[tool], input), [], `${tool} example is not a published model input: ${JSON.stringify(input)}`);
  }
  for (const s of samples.filter(s => s.response.result?.kind === 'tool_call')) {
    const { tool, input } = s.response.result.call;
    assert.ok(examples.some(e => e.tool === tool && canon(e.input.action ?? null) === canon(input.action ?? null) && Boolean(e.input.directBuild) === Boolean(input.directBuild)),
      `loaded skill documents no ${tool} ${input.action ?? ''}${input.directBuild ? ' directBuild ' + input.directBuild.method : ''}`);
  }
  assert.ok(examples.some(e => e.tool === 'hanaworlds_build' && e.input.directBuild?.method === 'PER_CELL'), 'clear direct build (PER_CELL) must stay');
  assert.ok(examples.some(e => e.tool === 'hanaworlds_build' && e.input.directBuild?.method === 'REGION'), 'clear direct build (REGION) must stay');
  assert.ok(examples.some(e => e.tool === 'hanaworlds_image_material' && Object.keys(e.input).join() === 'attachmentRef'), 'image material must stay, by attachmentRef only');
  assert.match(content, /affectedObjects/, 'skill must name affected objects from the build refusal');
  assert.doesNotMatch(content, /Stop, say which, and ask the player/, 'ungrounded "say which" must be replaced');
  assert.match(content, /worldCreation/); assert.match(content, /creation_result/);
  assert.doesNotMatch(content, /"action":"(continue|apply|redo)"|recordContinueDecision|receiveWorldCreationResult|"imageBytes"/, 'skill must not instruct non-model actions or typed facts');
});

// ---- external modules, through their published contract samples only ----
test('published samples are the verbatim C-session and C-painter document values this skill consumes', () => {
  assert.equal(externalDoc.provenance['C-session.md'].sha256, 'ffd12e6f028254e1e16d063312d06371f53ea84e5c4b01d11776ca5287cebbb5');
  assert.equal(painterImage.provenance['C-painter.md'].sha256, 'a08043484ca55f975592b8ea3ab385bc82ddfa080a947ef257ac0b6372b44b4c');
  assert.equal(modelCases.length, 17); assert.equal(painterImage.examples.length, 24);
  for (const c of external) for (const k of ['request', 'response']) {
    const t = c.types?.[k];
    if (t && defs[t] && c.requestAdmitted !== false) assert.deepEqual(v({ $ref: `#/definitions/${t}` }, c[k]), [], `${c.id}.${k} is not a published ${t}`);
  }
  for (const c of modelCases) for (const k of ['modelInput', 'hostContext', 'native', 'modelMessage']) {
    const t = c.types?.[k];
    if (t && defs[t]) assert.deepEqual(v({ $ref: `#/definitions/${t}` }, c[k]), [], `${c.id}.${k} is not a published ${t}`);
  }
});

test('every C-skill sample is grounded value by value on what the model actually receives', () => {
  const missing = [];
  for (const s of samples) {
    const g = s.grounding, cs = (g.cases || []).map(id => byId[id]);
    if (g.check === 'none') continue;
    if (cs.some(c => !c)) { missing.push(`${s.id}: case not published`); continue; }
    const [c] = cs, r = s.response.result;
    if (g.check === 'input-equal') {
      assert.equal(canon(r.call.input), canon(inputOf(c)), s.id); assert.equal(r.call.tool, c.request?.toolName ?? c.toolName);
      if (c.modelMessage) assert.equal(c.native.isError, false, `${s.id}: grounding must be a success`); else assert.equal(c.response.error, null, s.id);
    }
    if (g.check === 'image-input-equal') { const x = images[g.images[0]]; assert.equal(canon(r.call.input), canon(x.modelInput)); assert.equal(x.nativeDisplayObservation.isError, false); assert.equal(x.worldWrites, 0); assert.equal(x.modelCalls, 0); }
    if (g.check === 'proposal-equal') assert.equal(canon(r.proposal.value), canon(c.request.modelInput.proposal), s.id);
    if (g.check === 'model-names') {
      const seen = visible(c);
      assert.equal(c.native.isError, true); assert.equal(seen.error.code, 'OTHER_OBJECTS_AFFECTED'); assert.equal(seen.error.mutationState, 'NONE');
      assert.ok(seen.affectedObjects.length > 0, `${s.id}: the model must receive a non-empty list`);
      assert.deepEqual(seen.affectedObjects.map(o => o.objectRef), [...seen.affectedObjects.map(o => o.objectRef)].sort(), 'names must arrive objectRef-ordered');
      assert.deepEqual([...r.question.matchAll(/「([^」]+)」/g)].map(m => m[1]), seen.affectedObjects.map(o => o.displayName), `${s.id}: must name exactly what the model received, in order`);
      assert.ok(zero(c));
    }
    if (g.check === 'model-code') {
      const seen = visible(c); assert.equal(seen.error.code, g.code, s.id); assert.equal(seen.error.mutationState, 'NONE'); assert.ok(zero(c), `${s.id}: refusal has effects`);
      if (r) assert.ok(r.question.includes(seen.error.code) && r.question.includes(seen.error.reason), `${s.id}: must report the received code and reason`);
      if (g.code !== 'OTHER_OBJECTS_AFFECTED') assert.deepEqual(seen.affectedObjects, [], `${s.id}: no names may be invented`);
    }
    if (g.check === 'continue') {
      const [rec, adv] = cs;
      assert.equal(rec.response.error, null); assert.equal(rec.request.decision.sourceDecision.result.decisionKind, 'NO_NOTIFICATION');
      assert.deepEqual(rec.request.decision.affectedObjectRefs, []);
      assert.equal(canon(r.call.input), canon(adv.request.modelInput)); assert.equal(adv.response.error, null);
    }
    if (g.check === 'code') { assert.equal(c.response.error?.code, g.code, s.id); assert.equal(c.response.error.mutationState, 'NONE'); assert.ok(zero(c), `${s.id}: refusal has effects`); }
    if (g.check === 'creation') {
      const wc = c.response.result.worldCreation;
      assert.equal(canon(r.worldCreation), canon(wc), `${s.id}: reply must echo worldCreation verbatim`);
      if (g.corpusIndex === null) assert.equal(wc, null); else {
        assert.equal(canon(wc), canon({ creationFacts: corpus[g.corpusIndex] }), `${s.id}: published value differs from corpus`);
        assert.equal(canon(c.response.result.observation.worldCreation), canon(wc));
        assert.ok(r.text.includes(JSON.stringify(wc.creationFacts)), `${s.id}: reply must show the JSON verbatim`);
      }
      assert.ok(zero(c), `${s.id}: creation read has effects`);
    }
  }
  assert.deepEqual(missing, [], `published contract samples missing for:\n${missing.join('\n')}`);
});

test('worldCreation null and {creationFacts:null} stay distinct end to end', () => {
  const nullFacts = samples.find(s => s.id === 'reply-creation-00').response.result;
  const none = samples.find(s => s.id === 'reply-creation-13').response.result;
  assert.equal(canon(nullFacts.worldCreation), canon({ creationFacts: null }));
  assert.equal(none.worldCreation, null);
  assert.notEqual(nullFacts.text, none.text);
  assert.equal(canon(byId['world-creation-json-0'].response.result.worldCreation), canon({ creationFacts: null }));
  assert.equal(byId['world-creation-external-world'].response.result.worldCreation, null);
});

test('confirmation and continue come only from the current human action; model, stale, changed and overlapping decisions are refused', () => {
  assert.equal(byId['session-confirm-human'].response.error, null);
  for (const id of ['session-confirm-model-confirmation', 'session-confirm-tool-result-confirmation', 'session-confirm-old-turn', 'session-confirm-changed-brief', 'session-confirm-changed-placement',
    'continue-missing-decision', 'continue-model-forged-decision', 'continue-old-turn', 'continue-changed-world', 'continue-changed-target-facts', 'continue-changed-affected-set', 'continue-overlap-not-authorized']) {
    const c = byId[id]; assert.ok(c, `${id} not published`);
    assert.ok(c.response.error, `${id} must be refused`); assert.equal(c.response.error.mutationState, 'NONE', id); assert.ok(zero(c), `${id} has effects`);
  }
  const self = byId['model-self-confirm-refusal']; assert.ok(self && self.native.isError && zero(self), 'model self-confirmation must be refused with zero effects');
  const overlap = byId['continue-overlap-not-authorized'];
  assert.equal(overlap.request.decision.sourceDecision.result.decisionKind, 'CONTINUE');
  assert.ok(overlap.request.decision.sourceDecision.result.affectedObjectRefs.length > 0);
  assert.equal(overlap.response.error.code, 'OTHER_OBJECTS_AFFECTED', 'CONTINUE never authorizes overwriting other objects');
  assert.match(content, /continu[^\n]*(never|not)[^\n]*(overwrite|override|authori[sz]e)/i, 'skill must say a continue decision never authorizes touching other objects');
  assert.match(content, /(player's|human)[^\n]*(new|current)[^\n]*(message|turn)/i, 'skill must ground confirmation in the player\'s current message');
});

test('errors keep the seven core fields and only the published optional source/worldRef; unknown members refused', () => {
  const full = byId['canvas-json-full-source'], legacy = byId['canvas-json-legacy-core'];
  const core = ['code', 'phase', 'retryability', 'mutationState', 'transactionRef', 'causeCode', 'reason'];
  assert.deepEqual(Object.keys(legacy.response.publicError).sort(), [...core].sort());
  assert.deepEqual(Object.keys(full.response.publicError).sort(), [...core, 'source', 'worldRef'].sort());
  assert.deepEqual(Object.keys(full.response.publicError.source).sort(), ['kind', 'nativeCode', 'operation', 'owner', 'resource']);
  for (const id of ['canvas-json-unknown-error-member', 'canvas-json-unknown-source-member']) { const c = byId[id]; assert.ok(c); assert.ok(zero(c), id); }
  assert.match(content, /(code|reason)[^\n]*(source|owner)/i, 'skill must forward the returned code, reason and failure source as given');
});

test('image material: only attachmentRef from the model; typed and world facts forged by the model are refused with zero effects', () => {
  assert.deepEqual(painterImage.parameters.required, ['attachmentRef']);
  assert.equal(images.normal.nativeDisplayObservation.isError, false);
  for (const id of ['forged-typed', 'forged-world', 'cross-session', 'stale', 'missing-attachment', 'unbound']) {
    const x = images[id]; assert.ok(x, `${id} not published`);
    assert.equal(x.nativeDisplayObservation.isError, true, `${id} must be refused`); assert.equal(x.worldWrites, 0); assert.equal(x.modelCalls, 0);
  }
});

test('persistent observation reads are complete and zero-write', () => {
  for (const id of ['observe-session-list-success', 'observe-undo-status-success', 'observe-object-names-success', 'observe-domain-projection-success',
    'observe-session-list-refusal', 'observe-undo-status-refusal', 'observe-object-names-refusal', 'observe-domain-projection-refusal']) {
    const c = byId[id]; assert.ok(c, `${id} not published`); assert.ok(zero(c), `${id} has effects`);
    if (c.before && c.after) assert.equal(canon(c.after), canon(c.before), `${id}: observation changed state`);
  }
});

test.after(async () => { if (!process.env.HANA_SKILLS_KEEP_TEST_ROOT) await rm(root, { recursive: true, force: true }); });

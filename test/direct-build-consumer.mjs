import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildingSkill, canonicalJSON, createSkillToolsMock, toolManifest, validateRequest, validateResponse,
  validateToolRequest, validateType, version,
} from 'hanaworlds-contracts';
import fixture from 'hanaworlds-contracts/fixtures/direct-build' with { type: 'json' };

// Independent consumer of the published direct-build contract: only the installed
// package's manifest, validators and SOURCE/FIXTURE examples; no Workshop source.
const skill = readFileSync(new URL('../skills/hanaworlds-building/SKILL.md', import.meta.url), 'utf8');
const examples = [...skill.matchAll(/```json tool=(hanaworlds_[A-Za-z0-9_]+)\s*\n([\s\S]*?)\n```/g)]
  .map(([, tool, body]) => ({ tool, input: JSON.parse(body) }));
const buildAction = toolManifest.tools.find(tool => tool.name === 'hanaworlds_build')
  .actions.find(action => action.action === 'build');
const sha = value => createHash('sha256').update(canonicalJSON(value), 'utf8').digest('hex');
const codeOf = fn => { try { fn(); } catch (error) { return error.code; } return null; };

test('published manifest declares the direct build action this skill depends on', () => {
  const [major, minor] = version.split('.').map(Number);
  assert.ok(major === 2 && minor >= 6, `contracts ${version} predates direct build`);
  assert.ok(buildAction, 'hanaworlds_build action build must be declared by the published manifest');
  assert.equal(buildAction.input, 'ToolDirectBuildInput');
  assert.equal(buildingSkill.directBuild.action, 'build');
  assert.ok(buildingSkill.tools.includes('hanaworlds_build'));
});

test('direct build examples carry only action and a neutral proposal', () => {
  const direct = examples.filter(item => item.tool === 'hanaworlds_build' && item.input.action === 'build');
  assert.deepEqual(direct.map(item => item.input.proposal.decision).sort(), ['BUILD', 'REGION']);
  for (const { input } of direct) {
    assert.deepEqual(Object.keys(input).sort(), ['action', 'proposal']);
    validateType('ToolDirectBuildInput', input);
    for (const forged of [{ confirmedProposalRef: 'x' }, { confirmed: true }, { clear: true }, { intentAuthorization: {} }, { sessionRef: 'x' }]) {
      assert.throws(() => validateType('ToolDirectBuildInput', { ...input, ...forged }));
    }
  }
  // The agreement path validates the same neutral shapes before a host-confirmed apply.
  const pending = examples.filter(item => /^hanaworlds_(region_)?proposal$/.test(item.tool));
  assert.deepEqual(pending.map(item => item.input.proposal.decision).sort(), ['BUILD', 'REGION']);
  assert.ok(examples.some(item => item.tool === 'hanaworlds_build' && item.input.action === 'apply'));
});

test('skill names both paths and every published direct build refusal', () => {
  for (const phrase of ['hanaworlds_build action build', 'hanaworlds_proposal action validate',
    'hanaworlds_region_proposal action validate', 'hanaworlds_build action apply',
    'hanaworlds_write_methods action read', 'hanaworlds_context action read']) {
    assert.ok(skill.includes(phrase), phrase);
  }
  for (const word of ['Position', 'Size', 'Materials']) assert.match(skill, new RegExp(`\\*\\*${word}\\*\\*`));
  for (const code of buildAction.errors) assert.ok(skill.includes(code), `unhandled published refusal ${code}`);
});

test('published C-skill direct calls match the shape the skill emits', () => {
  assert.equal(fixture.calls.length, 2);
  for (const call of fixture.calls) {
    validateRequest('skill/v1', 'hanaworlds-building', call.request);
    validateResponse('skill/v1', 'hanaworlds-building', call.response);
    const { tool, input } = call.response.result.call;
    assert.equal(tool, 'hanaworlds_build');
    assert.deepEqual(Object.keys(input).sort(), ['action', 'proposal']);
    validateType('ToolDirectBuildInput', input);
  }
});

test('fixture provider builds only under independent host authorization', () => {
  const mock = createSkillToolsMock(fixture);
  for (const decision of ['BUILD', 'REGION']) {
    const exchange = fixture.exchanges.find(x => x.response.result && x.request.input.proposal.decision === decision);
    const { request, hostFacts } = exchange;
    assert.equal(mock('hanaworlds_build', request, hostFacts).result.outcome.outcome, 'VERIFIED');
    const { intentAuthorization, ...unauthorizedFacts } = hostFacts;
    const { intentAuthorization: carrier, ...bareRequest } = request;
    assert.equal(codeOf(() => mock('hanaworlds_build', request, unauthorizedFacts)), 'INTENT_UNCONFIRMED');
    assert.equal(codeOf(() => mock('hanaworlds_build', bareRequest, hostFacts)), 'INTENT_UNCONFIRMED');
    const changed = structuredClone(request);
    changed.input.proposal = decision === 'BUILD'
      ? { ...changed.input.proposal, boxes: [{ ...changed.input.proposal.boxes[0], max: [1, 1, 1] }] }
      : { ...changed.input.proposal, block: { ...changed.input.proposal.block, origin: [0, 0, 0] } };
    assert.equal(codeOf(() => mock('hanaworlds_build', changed, hostFacts)), 'INTENT_UNCONFIRMED');
    const staleMessage = { ...hostFacts, currentUserRequest: { ...hostFacts.currentUserRequest, text: 'a later message' } };
    assert.equal(codeOf(() => mock('hanaworlds_build', request, staleMessage)), 'INTENT_UNCONFIRMED');
    const otherWorld = structuredClone(hostFacts);
    otherWorld.localContext.worldRef = 'another-world';
    otherWorld.intentAuthorization.localContext.worldRef = 'another-world';
    assert.equal(codeOf(() => mock('hanaworlds_build', request, otherWorld)), 'CURRENT_WORLD_MISMATCH');
    assert.equal(codeOf(() => mock('hanaworlds_build',
      { ...request, input: { ...request.input, confirmed: true } }, hostFacts)), 'UNKNOWN_REQUIRED_FIELD');
    assert.ok(carrier && intentAuthorization);
  }
});

test('every published direct build refusal is returned as a legal error', () => {
  const exchange = fixture.exchanges.find(x => x.response.result && x.request.input.proposal.decision === 'BUILD');
  for (const code of buildAction.errors) {
    const response = createSkillToolsMock(fixture, { 'hanaworlds_build:build': code })(
      'hanaworlds_build', exchange.request, exchange.hostFacts);
    assert.equal(response.result, null);
    assert.equal(response.error.code, code);
  }
});

test("the skill's own example passes only when the host authorized exactly it", () => {
  // Fixture host: authorizes the exact proposal for the current message, as the
  // published handoff describes; the skill input itself never carries authorization.
  const { hostFacts } = fixture.exchanges.find(x => x.response.result && x.request.input.proposal.decision === 'BUILD');
  const input = examples.find(item => item.tool === 'hanaworlds_build' && item.input.action === 'build').input;
  const { currentUserRequest, intentAuthorization: stored, ...context } = hostFacts;
  const authorize = proposal => ({ ...stored, proposalDigest: sha(proposal), messageDigest: sha(currentUserRequest) });
  const facts = { ...context, currentUserRequest, intentAuthorization: authorize(input.proposal) };
  const request = { contractVersion: fixture.exchanges[0].request.contractVersion, requestId: 'skill-example',
    hostContext: context, input, intentAuthorization: facts.intentAuthorization };
  validateToolRequest('hanaworlds_build', request, facts);
  const other = structuredClone(input);
  other.proposal.boxes[0].max = [2, 1, 1];
  assert.equal(codeOf(() => validateToolRequest('hanaworlds_build', { ...request, input: other }, facts)), 'INTENT_UNCONFIRMED');
});

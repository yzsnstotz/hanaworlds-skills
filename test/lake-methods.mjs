// skills-06 / J5.S1: Markdown SOURCE assertions, not a simulated planner.
// Run after the unchanged npm run lint:skills:
// node --test test/lake-methods.mjs
// Actual model selection, current-world capability and lake readback are product gates.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { lintSkill } from '../tools/lint-skills.mjs';

const filename = 'skills/hanaworlds-building/SKILL.md';
const skill = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
const rules = skill.replace(/```[^\n]*\n[\s\S]*?\n```/g, '').replace(/\s+/g, ' ');

function requires(requirements) {
  const missing = requirements.filter(([, pattern]) => !pattern.test(rules)).map(([meaning]) => meaning);
  assert.deepEqual(missing, [], `missing lake/method guidance: ${missing.join('; ')}`);
}

test('LAKE-01 SOURCE: read current methods and context using published model inputs', () => {
  const examples = [...skill.matchAll(/```json tool=(hanaworlds_\w+)\s*\n([\s\S]*?)\n```/g)]
    .map(([, tool, body]) => ({ tool, input: JSON.parse(body) }));
  assert.ok(examples.some(e => e.tool === 'hanaworlds_write_methods' && Object.keys(e.input).length === 0));
  assert.ok(examples.some(e => e.tool === 'hanaworlds_context' && e.input.action === 'read'));
  requires([
    ['read before designing', /Read the write methods and the current context before designing/i],
    ['parse real result JSON', /parse that text and use only the values in it/i],
  ]);
});

test('LAKE-02 SOURCE: compare the runtime purpose, scale, guidance and capability fields', () => {
  // Names come from C-session WriteMethodEntry/WriteMethodDescription/WriteAvailability.
  // They are facts for the model to consume, never model-supplied authorization.
  requires([
    ...['purpose', 'typicalScale', 'scaleUnit', 'whenToUse', 'notFor', 'input', 'available', 'unmet']
      .map(field => [`use reported ${field}`, new RegExp(`\\b${field}\\b`)]),
    ['compare the reported method guidance', /(?:compare|choose|select|use)[^.]*(?:descriptor|guidance)[^.]*(?:method|REGION|PER_CELL)/i],
  ]);
});

test('LAKE-03 SOURCE: reported typical scale is guidance rather than a fixed switch', () => {
  requires([
    ['typicalScale is not a fixed cutoff', /typicalScale[^.]*(?:not|never|no)[^.]*(?:threshold|cutoff|cut.off|limit)|(?:not|never|no)[^.]*(?:threshold|cutoff|cut.off|limit)[^.]*typicalScale/i],
    ['no invented size threshold', /never invent a size threshold|(?:do not|never)[^.]*(?:fixed|hard.coded)[^.]*(?:threshold|cutoff|cut.off)/i],
  ]);
  assert.doesNotMatch(rules,
    /(?:if|when|above|below|over|under|exceeds?)\s+(?:the\s+)?\d+\s+(?:cells?|blocks?|chunks?)[^.]*(?:REGION|PER_CELL)/i,
    'method choice must not encode a numeric world-size switch');
});

test('LAKE-04 SOURCE: a lake uses REGION when the current world recommends whole-volume terrain work', () => {
  requires([
    ['connect a lake request to REGION under current guidance', /(?:lake[^.]*REGION|REGION[^.]*lake)[^.]*(?:runtime|reported|current|guidance)|(?:runtime|reported|current|guidance)[^.]*(?:lake[^.]*REGION|REGION[^.]*lake)/i],
    ['select for terrain excavation or filling', /(?:dig|excavat|terrain|fill)[^.]*(?:REGION|whole.volume)|REGION[^.]*(?:dig|excavat|terrain|fill)/i],
    ['selection still requires the reported capability', /only when runtime facts report that method as available|REGION[^.]*(?:available|capability)/i],
  ]);
});

test('LAKE-05 SOURCE: unavailable REGION is a refusal, not permission to split or force another method', () => {
  requires([
    ['report missing facts and remedy before writing', /(?:facts|guidance|capability)[^.]*(?:missing|unavailable)[^.]*(?:reason|remedy)[^.]*(?:stop|before writing)/i],
    ['do not force PER_CELL or split the lake to bypass unavailable REGION', /(?:never|do not)[^.]*(?:split|subdivid|force|fallback|fall back|switch)[^.]*(?:PER_CELL|unavailable REGION|missing capability)/i],
    ['no unchanged failure retry', /never[^.]*(?:repeat|retry)[^.]*(?:unchanged|failed)|never[^.]*unchanged[^.]*(?:repeat|retry)/i],
  ]);
});

test('LAKE-06 SOURCE: lake boundaries, depth and water remain player intent rather than defaults', () => {
  requires([
    ['clarify an unresolved lake footprint and depth', /(?:lake|excavat)[^.]*(?:boundary|boundaries|footprint)[^.]*(?:depth)[^.]*(?:ask|clarif)|(?:ask|clarif)[^.]*(?:lake|excavat)[^.]*(?:boundary|boundaries|footprint)[^.]*(?:depth)/i],
    ['water choice and level use current facts or clarification', /(?:water|liquid)[^.]*(?:level)[^.]*(?:current|runtime|ask|clarif)|(?:current|runtime|ask|clarif)[^.]*(?:water|liquid)[^.]*(?:level)/i],
    ['no invented materials from other worlds', /never infer materials[^.]*(?:memory|another world)/i],
  ]);
});

test('LAKE-07 SOURCE: neutral REGION geometry distinguishes excavation from preserving cells', () => {
  requires([
    ['use runtime geometry profile', /region design[^.]*runtime geometry profile/i],
    ['absolute coordinates', /Coordinates are absolute world cell coordinates/i],
    ['empty material digs; null keeps existing content', /catalogue.s empty material reference digs[^.]*null palette index keeps/i],
    ['runs cover the volume', /counts sum to sx\*sy\*sz/i],
    ['opaque materials are not decoded', /Never construct or decode a material reference/i],
  ]);
});

test('LAKE-08 SOURCE: clear intent builds directly and unclear intent waits for a new player confirmation', () => {
  requires([
    ['clear direct build without an extra permission question', /do not ask "shall I build it\?" first/i],
    ['ask about open position, size or material', /position, size or materials[^.]*(?:open|unclear)|(?:open|unclear)[^.]*(?:position|size|materials)/i],
    ['a validated proposal remains pending', /validated proposal is pending, never confirmed/i],
    ['confirmation comes from a new player message', /Confirmation comes only from the player's new message/i],
    ['changed design invalidates the old confirmation', /Every change needs a new submission and a new confirmation/i],
  ]);
});

test('LAKE-09 SOURCE: affected buildings are named and continuation cannot overwrite them', () => {
  requires([
    ['name every reported object and stop to ask', /Name every object[^.]*ask whether to continue[^.]*stop for this turn/i],
    ['continue does not authorize overwriting', /continue decision never authorizes overwriting the other objects/i],
    ['changed affected facts require fresh notification', /affected set changed[^.]*name the objects again and ask again/i],
    ['safety rejection cannot be relaxed', /SAFETY_INVARIANT_FAILED[^]*never try to relax the rule/i],
  ]);
});

test('LAKE-10 SOURCE: the original schema/vocabulary lint and verified-receipt rule remain', () => {
  assert.deepEqual(lintSkill(skill, filename), []);
  requires([
    ['only a verified receipt is success', /Report success only for a VERIFIED outcome with its actual receipt/i],
    ['pending is not completion', /PENDING means[^.]*not that the build is done/i],
    ['unknown is not a replacement write', /UNKNOWN[^.]*must not trigger an invented replacement transaction/i],
  ]);
});

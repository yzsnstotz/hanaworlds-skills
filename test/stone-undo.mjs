// skills-07 / J5.S3: SOURCE assertions over the shipped model instructions.
// This is not a planner, transaction simulator or real-world/model acceptance.
// Q-319 official card command, preserving the original lint:
// npm run lint:skills && node --test test/reference-images.mjs test/lint-skills.mjs test/image-materials.mjs test/lake-methods.mjs test/stone-undo.mjs
// Missing guidance fails this command's test phase; the original lint stays unchanged.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { lintSkill } from '../tools/lint-skills.mjs';
import { validate } from '../tools/schema.mjs';

const filename = 'skills/hanaworlds-building/SKILL.md';
const skill = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
const structures = JSON.parse(readFileSync(new URL('../tools/structures.json', import.meta.url), 'utf8'));
const prose = skill.replace(/```[^\n]*\n[\s\S]*?\n```/g, '');
const rules = prose.replace(/\s+/g, ' ');
// Do not require a new heading or an exact paragraph. Scope stone-specific rules
// to paragraphs naming the object so generic lake instructions cannot satisfy them.
const stoneRules = prose.split(/\n\s*\n/).filter(p => /\b(?:stone|rock|boulder|pebble)\b/i.test(p))
  .join(' ').replace(/\s+/g, ' ');
const examples = [...skill.matchAll(/```json tool=(hanaworlds_\w+)\s*\n([\s\S]*?)\n```/g)]
  .map(([, tool, body]) => ({ tool, input: JSON.parse(body) }));

function requires(text, requirements) {
  const missing = requirements.filter(([, pattern]) => !pattern.test(text)).map(([meaning]) => meaning);
  assert.deepEqual(missing, [], `missing stone/undo guidance: ${missing.join('; ')}`);
}

test('STONE-01 SOURCE: choose from current runtime method facts, not a remembered size switch', () => {
  assert.ok(examples.some(e => e.tool === 'hanaworlds_write_methods' && Object.keys(e.input).length === 0));
  assert.ok(examples.some(e => e.tool === 'hanaworlds_context' && e.input.action === 'read'));
  requires(rules, [
    ...['purpose', 'typicalScale', 'scaleUnit', 'whenToUse', 'notFor', 'input', 'available', 'unmet']
      .map(field => [`consume reported ${field}`, new RegExp(`\\b${field}\\b`)]),
    ['do not invent a size threshold', /never invent a size threshold|(?:never|do not)[^.]*(?:fixed|hard.coded)[^.]*(?:threshold|cutoff)/i],
  ]);
});

test('STONE-02 SOURCE: a lake-side stone uses PER_CELL only when current guidance and availability support it', () => {
  requires(stoneRules, [
    ['relate the lake-side stone to PER_CELL', /(?:lake|shore|bank)[^.]*PER_CELL|PER_CELL[^.]*(?:lake|shore|bank)/i],
    ['ground the choice in current method guidance', /(?:current|runtime|reported)[^.]*(?:guidance|descriptor|purpose)/i],
    ['check current availability', /(?:available|availability|capability)/i],
    ['stop on missing PER_CELL instead of substituting REGION', /(?:unavailable|missing)[^.]*PER_CELL[^.]*(?:stop|refus)|PER_CELL[^.]*(?:unavailable|missing)[^.]*(?:stop|refus)/i],
    ['do not silently switch to REGION', /(?:never|do not)[^.]*(?:switch|force|fallback|fall back|substitut)[^.]*REGION/i],
  ]);
});

test('STONE-03 SOURCE: resolve the new stone request without borrowing the lake confirmation', () => {
  requires(stoneRules, [
    ['resolve stone position and size from current intent or ask', /(?:position|placement)[^.]*(?:size|dimensions)[^.]*(?:ask|clarif)|(?:ask|clarif)[^.]*(?:position|placement)[^.]*(?:size|dimensions)/i],
    ['resolve stone material from the current vocabulary', /(?:material)[^.]*(?:current|runtime|vocabulary|catalogue)|(?:current|runtime|vocabulary|catalogue)[^.]*(?:material)/i],
    ['lake confirmation does not authorize the stone', /(?:lake)[^.]*(?:confirmation|consent|authorization)[^.]*(?:not|never|cannot)|(?:never|do not)[^.]*(?:reuse|carry|borrow)[^.]*(?:lake)[^.]*(?:confirmation|consent|authorization)/i],
  ]);
  requires(rules, [
    ['clear requests retain direct build', /do not ask "shall I build it\?" first/i],
    ['unclear proposals await a new player confirmation', /Confirmation comes only from the player's new message/i],
  ]);
});

test('STONE-04 SOURCE: per-cell placement stays inside inspected known-empty geometry', () => {
  requires(rules, [
    ['translate local offsets using the reported frame', /local box offsets translate from its sampled minimum/i],
    ['write only known empty cells in the target', /Each translated cell must be known empty and inside the inspected target/i],
    ['occupied and unknown cells cannot be written', /occupied or unknown cells are not writable/i],
    ['do not silently expand or move the target', /Do not clip, expand the inspection, guess a new frame or move an agreed target/i],
  ]);
});

test('STONE-05 SOURCE: the stone is a separate transaction with only its own agreed scope', () => {
  requires(stoneRules, [
    ['keep stone and lake transactions separate', /(?:separate|distinct|independent|own)[^.]*transaction[^.]*lake|lake[^.]*(?:separate|distinct|independent|own)[^.]*transaction/i],
    ['never merge stone work into the lake transaction', /(?:never|do not)[^.]*(?:merge|combine|append|bundle|reuse)[^.]*(?:lake|transaction)/i],
    ['scope this operation to the agreed stone', /(?:only|within|limited)[^.]*(?:agreed|confirmed|requested)[^.]*(?:stone|rock|boulder|pebble)|(?:agreed|confirmed|requested)[^.]*(?:stone|rock|boulder|pebble)[^.]*(?:only|scope|bounds)/i],
    ['preserve the lake and its water', /(?:preserve|unchanged|do not (?:change|modify|rewrite)|never (?:change|modify|rewrite))[^.]*(?:lake|basin)[^.]*(?:water)|(?:lake|basin)[^.]*(?:water)[^.]*(?:unchanged|preserv)/i],
  ]);
});

test('STONE-06 SOURCE: undo uses the published action without an invented transaction selector', () => {
  const undo = examples.filter(e => e.tool === 'hanaworlds_build' && e.input.action === 'undo');
  assert.ok(undo.length > 0, 'publish a model-facing Undo example');
  for (const e of undo) assert.deepEqual(e.input, { action: 'undo' });
  for (const { tool, input } of examples) {
    assert.ok(structures.tools[tool], `undeclared model tool ${tool}`);
    assert.deepEqual(validate(structures.tools[tool].input, input, structures.definitions), [], tool);
  }
});

test('STONE-07 SOURCE: check that the current undo head is this verified stone before undoing', () => {
  assert.ok(examples.some(e => e.tool === 'hanaworlds_build' && ['status', 'inspect'].includes(e.input.action)));
  requires(stoneRules, [
    ['inspect current undo availability and head', /(?:status|inspect)[^.]*(?:head|history)[^.]*(?:AVAILABLE|availability)|(?:AVAILABLE|availability)[^.]*(?:head|history)[^.]*(?:status|inspect)/i],
    ['associate the current head with the stone receipt', /(?:head|headTransactionId)[^.]*(?:match|equal|correspond)[^.]*(?:receipt|transaction)|(?:receipt|transaction)[^.]*(?:match|equal|correspond)[^.]*(?:head|headTransactionId)/i],
    ['only a VERIFIED stone can be the undo target', /VERIFIED[^.]*(?:stone|rock|receipt|transaction)|(?:stone|rock|receipt|transaction)[^.]*VERIFIED/i],
    ['unavailable, changed or unmatched history stops undo', /(?:unavailable|changed|mismatch|does not match|cannot (?:match|establish))[^.]*(?:stop|refus|do not undo)/i],
  ]);
});

test('STONE-08 SOURCE: undo the stone once and never walk backwards into the lake', () => {
  requires(stoneRules, [
    ['one undo for this stone request', /(?:undo[^.]*(?:once|one time|single)|(?:once|single)[^.]*undo)/i],
    ['never repeat undo to reach an older transaction', /(?:never|do not)[^.]*(?:repeat|loop|chain|multiple)[^.]*undo|(?:never|do not)[^.]*undo[^.]*(?:repeatedly|older|earlier)/i],
    ['keep the lake after undo', /(?:undo|restore)[^.]*(?:lake)[^.]*(?:unchanged|preserv|remain)|(?:lake)[^.]*(?:unchanged|preserv|remain)[^.]*(?:undo|restore)/i],
    ['check the returned verified undo and history heads', /(?:undo|restor)[^.]*VERIFIED[^.]*(?:beforeHead|afterHead)|(?:beforeHead|afterHead)[^.]*VERIFIED/i],
  ]);
});

test('STONE-09 SOURCE: refusals and uncertain outcomes cannot trigger a replacement erase or retry', () => {
  requires(rules, [
    ['never erase a bounding volume as Undo', /never erase a bounding volume yourself/i],
    ['unknown cannot create a replacement transaction', /UNKNOWN[^.]*must not trigger an invented replacement transaction/i],
    ['do not retry an unchanged refusal', /never retry an unchanged call/i],
    ['report actual undo results', /Report actual results from the returned outcome/i],
    ['pending does not mean completion', /PENDING means[^.]*not that the build is done/i],
  ]);
});

test('STONE-10 SOURCE: original lint, lake and safety rules remain applicable', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['lint:skills'], 'node tools/lint-skills.mjs');
  assert.deepEqual(lintSkill(skill, filename), []);
  requires(rules, [
    ['lake excavation still uses runtime-guided REGION', /lake[^.]*REGION[^.]*(?:current|runtime|guidance)|(?:current|runtime|guidance)[^.]*lake[^.]*REGION/i],
    ['affected objects must all be named before asking', /Name every object[^.]*ask whether to continue/i],
    ['continue cannot authorize overwriting', /continue decision never authorizes overwriting the other objects/i],
    ['do not relax safety rules', /SAFETY_INVARIANT_FAILED[^]*never try to relax the rule/i],
  ]);
});

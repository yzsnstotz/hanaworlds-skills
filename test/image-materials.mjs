// skills-05 / J4.S3: SOURCE instructions and original lint regression only.
// No model, Painter runtime, real Host or game acceptance is claimed here.
// Card command: npm run lint:skills
// Runs the original structure lint first, then this suite and the existing
// reference-image/lint regressions. Missing instructions must fail that command.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { lintSkill } from '../tools/lint-skills.mjs';

const filename = 'skills/hanaworlds-building/SKILL.md';
const skill = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
const prose = text => text.replace(/```[^\n]*\n[\s\S]*?\n```/g, '').replace(/\s+/g, ' ');
const rules = prose(skill);
const image = skill.match(/^## Reference images\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] || '';

// Each group describes an instruction, rather than a required sentence or heading.
// The test runner rejects missing guidance; the original schema lint stays separate.
const materialRules = [
  ['dominant-match', /dominant\.rgb/i,
    /(?:nearest|closest)[^.]*CIEDE2000|CIEDE2000[^.]*(?:nearest|closest)/i,
    /match\.distance/i],
  ['apply-match', /material\.materialRef/i, /material\.orientation/i,
    /(?:use|copy|carry)[^.]*PER_CELL[^.]*REGION|PER_CELL[^.]*REGION[^.]*(?:use|copy|carry)/i],
  ['current-match', /(?:image|attachment)[^.]*changed|(?:changed|different)[^.]*(?:image|attachment)/i,
    /catalogueDigest/i, /sourceRevision/i,
    /(?:world|connection)[^.]*(?:chang|stale)|(?:chang|stale)[^.]*(?:world|connection)/i,
    /(?:read|match|request|obtain)[^.]*(?:again|fresh)|(?:fresh|again)[^.]*(?:read|match|request|obtain)/i],
  ['match-limits', /(?:nearest|closest)[^.]*(?:not|never|doesn't|cannot)[^.]*(?:exact|identical|perfect)|(?:not|never|cannot)[^.]*(?:exact|identical|perfect)[^.]*(?:nearest|closest)/i,
    /(?:explicit|requested|player)[^.]*(?:material)[^.]*(?:conflict|replace|substitut)|(?:conflict|replace|substitut)[^.]*(?:explicit|requested|player)[^.]*(?:material)/i],
  ['match-refusal', /(?:no|missing|unavailable)[^.]*(?:legal|usable|match)[^.]*(?:stop|do not build|do not write)|(?:stop|do not build|do not write)[^.]*(?:no|missing|unavailable)[^.]*(?:legal|usable|match)/i,
    /(?:never|do not)[^.]*(?:invent|guess|substitut)[^.]*(?:material|colour|color)|(?:material|colour|color)[^.]*(?:never|do not)[^.]*(?:invent|guess|substitut)/i],
];

for (const [id, ...requirements] of materialRules) {
  test(`MAT-${id} SOURCE: image palette guidance is explicit`, () => {
    const missing = requirements.filter(rule => !rule.test(prose(image)));
    assert.deepEqual(missing.map(String), [], `missing image material guidance: ${id}`);
  });
}

test('MAT-paths SOURCE: a clear image request builds directly; an unclear one waits for the player', () => {
  assert.match(rules, /Clear request: build directly/i);
  assert.match(rules, /do not ask "shall I build it\?" first/i);
  assert.match(prose(image), /initially clear request[^.]*clear direct-build path/i);
  assert.match(rules, /Ask about one or two open points at a time, or offer a concrete design/i);
  assert.match(prose(image), /do not confirm or build until the player answers/i);
  assert.match(rules, /validated proposal is pending, never confirmed/i);
  assert.match(rules, /Every change needs a new submission and a new confirmation/i);
  assert.match(rules, /Confirmation comes only from the player's new message/i);
});

test('MAT-safety SOURCE: palette choice cannot grant write or impact permission', () => {
  assert.match(rules, /Painter validation, fresh world facts, placement checks and safety rules still run/i);
  assert.match(rules, /Name every object[^.]*ask whether to continue[^.]*stop for this turn/i);
  assert.match(rules, /continue decision never authorizes overwriting the other objects/i);
  assert.match(rules, /SAFETY_INVARIANT_FAILED[^]*never try to relax the rule/i);
  assert.match(rules, /Report success only for a VERIFIED outcome with its actual receipt/i);
});

test('MAT-grounding SOURCE: structure, attachment and palette remain separate facts', () => {
  assert.match(prose(image), /Read the actual image together with the current conversation text/i);
  assert.match(prose(image), /Painter material matches cannot establish structure or geometry/i);
  assert.match(prose(image), /pass only the attachment reference/i);
  assert.match(rules, /never infer materials[^.]*from memory or from another world/i);
  assert.deepEqual(lintSkill(skill, filename), []);
});

// skills-04 / J4.S2: SOURCE checks for a Markdown-only module.
// These assert the instructions supplied to the model, not model compliance.
// Real-image conversations and current Host bindings remain product checks.
// Q-305 card command: npm run lint:skills && node --test test/reference-images.mjs
// Keep the original lint script separate; the card runs this suite after it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { lintSkill } from '../tools/lint-skills.mjs';
import { validate } from '../tools/schema.mjs';

const skill = readFileSync(new URL('../skills/hanaworlds-building/SKILL.md', import.meta.url), 'utf8');
const structures = JSON.parse(readFileSync(new URL('../tools/structures.json', import.meta.url), 'utf8'));
const section = skill.match(/^## Reference images\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] || '';
const imageRules = section.replace(/```[^\n]*\n[\s\S]*?\n```/g, '').replace(/\s+/g, ' ');
const allRules = skill.replace(/\s+/g, ' ');

function requires(text, requirements) {
  const missing = requirements.filter(([, rule]) => !rule.test(text)).map(([meaning]) => meaning);
  assert.deepEqual(missing, [], `missing image guidance: ${missing.join('; ')}`);
}

test('IMG-01 SOURCE: visual claims require the actual image, not its metadata or a material match', () => {
  requires(imageRules, [
    ['read the actual native image input', /(?:native model input|actual image|image content)/i],
    ['describe visible structure, roof, levels and openings', /visible structure, roof, levels and openings/i],
    ['filename, URL or attachment metadata cannot establish visual structure', /(?:filename|metadata|URL)[^.]*\b(?:not|never|cannot|no)\b[^.]*(?:visual|structure|seen)|(?:not|never|cannot|no)[^.]*(?:visual|structure|seen)[^.]*(?:filename|metadata|URL)/i],
    ['material matching does not establish visual structure', /(?:material|Painter)[^.]*(?:not|never|cannot)[^.]*(?:structure|geometry|visual)|(?:not|never|cannot)[^.]*(?:structure|geometry|visual)[^.]*(?:material|Painter)/i],
  ]);
});

test('IMG-02 SOURCE: read current conversation and carry forward only applicable player answers', () => {
  requires(imageRules, [
    ['combine the image with current conversation text and answers', /(?:current|same)[^.]*(?:conversation|session)[^.]*(?:text|words|answers)/i],
    ['reuse settled scale and purpose rather than asking again', /(?:already|settled|answered)[^.]*(?:scale|dimensions)[^.]*(?:purpose|use)|(?:already|settled|answered)[^.]*(?:purpose|use)[^.]*(?:scale|dimensions)/i],
    ['do not repeat questions whose answers still apply', /(?:do not|never|avoid)[^.]*(?:ask again|re-ask|repeat[^.]*question)/i],
    ['changed image or conflicting context needs fresh clarification', /(?:changed|different|conflict)[^.]*(?:image|reference|context|answer)[^.]*(?:ask|clarif)|(?:image|reference|context|answer)[^.]*(?:changed|different|conflict)[^.]*(?:ask|clarif)/i],
  ]);
});

test('IMG-03 SOURCE: describe observed structure before asking about unresolved scale or purpose', () => {
  requires(imageRules, [
    ['observation precedes clarification', /(?:first[^.]*(?:describe|explain|summari[sz])[^.]*(?:then|before)[^.]*(?:ask|clarif))|(?:(?:describe|explain|summari[sz])[^.]*before[^.]*(?:ask|clarif))/i],
    ['unclear scale triggers a question', /(?:scale|dimensions|proportion)[^.]*(?:unclear|unknown|missing|unsettled|open)[^.]*(?:ask|question|clarif)|(?:unclear|unknown|missing|unsettled|open)[^.]*(?:scale|dimensions|proportion)[^.]*(?:ask|question|clarif)/i],
    ['unclear purpose triggers a question', /(?:purpose|intended use)[^.]*(?:unclear|unknown|missing|unsettled|open)[^.]*(?:ask|question|clarif)|(?:unclear|unknown|missing|unsettled|open)[^.]*(?:purpose|intended use)[^.]*(?:ask|question|clarif)/i],
  ]);
});

test('IMG-04 SOURCE: pixels give no building scale and image appearance gives no intended use', () => {
  requires(imageRules, [
    ['do not derive dimensions from pixels', /do not derive real-world dimensions from pixels|(?:never|cannot|do not)[^.]*(?:infer|derive|guess)[^.]*(?:scale|dimensions)[^.]*(?:pixels|image size)/i],
    ['ask for whole-cell target dimensions or an explicit reference scale', /(?:ask|clarif)[^.]*(?:whole.cell|reference scale|target dimensions)/i],
    ['do not guess purpose from appearance', /(?:never|do not|cannot)[^.]*(?:guess|infer|assume)[^.]*(?:purpose|intended use)|(?:purpose|intended use)[^.]*(?:never|do not|cannot)[^.]*(?:guess|infer|assume)/i],
  ]);
});

test('IMG-05 SOURCE: hidden or unreadable structure remains uncertain, not invented', () => {
  requires(imageRules, [
    ['label occluded or unseen details as unknown', /(?:hidden|occluded|unseen|not visible)[^.]*(?:unknown|uncertain|cannot|do not|never)/i],
    ['separate observations from suggestions', /(?:distinguish|separate|label)[^.]*(?:observ|visible)[^.]*(?:suggest|propos|assum)|(?:distinguish|separate|label)[^.]*(?:suggest|propos|assum)[^.]*(?:observ|visible)/i],
    ['failed listing, download or decoding is no evidence of seeing the image', /do not claim to see an image when listing, download or decoding failed/i],
    ['missing visual input requires a usable attachment rather than a description invented from a link', /(?:missing|unavailable|unreadable|cannot (?:see|view|read))[^.]*(?:image|visual)[^.]*(?:ask|request)[^.]*(?:image|upload|attachment)|(?:image|visual)[^.]*(?:missing|unavailable|unreadable)[^.]*(?:ask|request)[^.]*(?:image|upload|attachment)/i],
  ]);
});

test('IMG-06 SOURCE: unresolved image intent waits for answers before confirmation or building', () => {
  requires(imageRules, [
    ['unresolved image intent cannot confirm or build', /(?:until|before)[^.]*(?:answer|clarif)[^.]*(?:do not|never|no)[^.]*(?:confirm|build)|(?:do not|never)[^.]*(?:confirm|build)[^.]*(?:until|before)[^.]*(?:answer|clarif)/i],
    ['after answers summarize settled intent for the agreement path', /(?:after|once)[^.]*(?:answer|clarif)[^.]*(?:summari[sz]|restate|agree|confirm)/i],
  ]);
  requires(allRules, [
    ['confirmation comes from a new player message', /Confirmation comes only from the player's new message in the current turn/i],
    ['clear requests retain direct build', /Clear request: build directly/i],
    ['do not add a confirmation hurdle to clear requests', /do not ask "shall I build it\?" first/i],
  ]);
});

test('IMG-07 SOURCE: existing image tools retain their published model input shapes', () => {
  const examples = [...section.matchAll(/```json tool=(hanaworlds_\w+)\s*\n([\s\S]*?)\n```/g)]
    .map(([, tool, body]) => ({ tool, input: JSON.parse(body) }));
  assert.ok(examples.some(e => e.tool === 'hanaworlds_context' && e.input.action === 'images'));
  assert.ok(examples.some(e => e.tool === 'hanaworlds_download_image' && typeof e.input.url === 'string'));
  assert.ok(examples.some(e => e.tool === 'hanaworlds_image_material'
    && Object.keys(e.input).join() === 'attachmentRef'));
  for (const { tool, input } of examples) {
    assert.ok(structures.tools[tool], `unpublished tool ${tool}`);
    assert.deepEqual(validate(structures.tools[tool].input, input, structures.definitions), [], tool);
  }
});

test('IMG-08 SOURCE: original schema and vocabulary lint still accepts the complete skill', () => {
  assert.deepEqual(lintSkill(skill, 'skills/hanaworlds-building/SKILL.md'), []);
});

test('IMG-09 SOURCE: missing dimensions or purpose are questions, not invented prepare controls', () => {
  requires(imageRules, [
    ['do not fill prepare controls with guessed dimensions or purpose', /(?:do not|never)[^.]*(?:invent|guess|placeholder|default)[^.]*(?:prepare|controls)|(?:prepare|controls)[^.]*(?:do not|never)[^.]*(?:invent|guess|placeholder|default)/i],
    ['ask before preparing when required intent fields are missing', /(?:ask|clarif)[^.]*(?:before|until)[^.]*(?:prepare|preparing)|(?:before|until)[^.]*(?:prepare|preparing)[^.]*(?:ask|clarif)/i],
  ]);
});

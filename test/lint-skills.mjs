import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = new URL('../tools/lint-skills.mjs', import.meta.url);
const skill = readFileSync(new URL('../skills/hanaworlds-building/SKILL.md', import.meta.url), 'utf8');
test('lint command exists and validates the shipped skill', () => {
  assert.ok(existsSync(script), 'the structure-based skill linter must exist');
  const result = spawnSync(process.execPath, [script.pathname], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
const proposal = '{"decision":"BUILD","materials":{"wall":{"materialRef":"m","orientation":0}},"boxes":[{"min":[0,0,0],"max":[0,0,0],"materialRef":"wall"}]}';
const controls = '{"purpose":"p","dimensions":{"width":1,"height":1,"depth":1,"unit":"node"},"entrancePortalRefs":[],"styleText":null,"siteRules":{"requireEntranceConnectivity":false,"entranceClearance":null,"hazardPolicy":{"forbidLiquid":true,"maximumDamagePerSecond":0},"optionalLightRule":null}}';
const direct = `{"action":"advance","directBuild":{"method":"PER_CELL","controls":${controls},"proposal":${proposal},"imageRefs":[]}}`;
test('lint accepts a clear direct build with a valid neutral proposal', () => {
  const dir = mkdtempSync(join(process.env.HANA_SKILLS_TEST_DIR || tmpdir(), 'hanaworlds-skills-lint-'));
  try {
    const filename = join(dir, 'SKILL.md');
    writeFileSync(filename, `${skill}\n\`\`\`json tool=hanaworlds_build\n${direct}\n\`\`\``);
    const result = spawnSync(process.execPath, [script.pathname, '--skill', filename], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('lint rejects unknown tools, legacy actions, wrong fields and engine vocabulary', () => {
  assert.ok(existsSync(script), 'the structure-based skill linter must exist');
  const dir = mkdtempSync(join(process.env.HANA_SKILLS_TEST_DIR || tmpdir(), 'hanaworlds-skills-lint-'));
  try {
    for (const [suffix, diagnostic] of [
      ['\nhanaworlds_unknown', /undeclared tool/],
      ['\nhanaworlds_build action apply', /undeclared action/],
      ['\n```json tool=hanaworlds_context\n{"action":"read","sessionRef":"invented"}\n```', /invalid input/],
      ['\n```json tool=hanaworlds_build\n{"action":"apply","confirmedProposalRef":"ref"}\n```', /invalid input/],
      ['\n```json tool=hanaworlds_build\n{"action":"continue"}\n```', /invalid input/],
      ['\n```json tool=hanaworlds_build\n{"action":"build","proposal":' + proposal + '}\n```', /invalid input/],
      ...[['confirmed', 'true'], ['clear', 'true'], ['intentAuthorization', '{}'], ['sessionRef', '"s"']]
        .map(([field, value]) => [`\n\`\`\`json tool=hanaworlds_build\n${direct.slice(0, -1)},"${field}":${value}}\n\`\`\``, /invalid input/]),
      ['\n```json tool=hanaworlds_image_material\n{"attachmentRef":"ref","imageBytes":[1]}\n```', /invalid input/],
      ['\n`hanaworlds_context.output.madeUp`', /unknown field/],
      ...['nodeName', 'param2', 'mapblock', 'flat mapgen', 'air', 'Luanti', 'Minetest'].map(word => [`\n${word}`, /engine vocabulary/]),
    ]) {
      const filename = join(dir, 'SKILL.md');
      writeFileSync(filename, skill + suffix);
      const result = spawnSync(process.execPath, [script.pathname, '--skill', filename], { encoding: 'utf8' });
      assert.equal(result.status, 1, suffix);
      assert.match(result.stderr, diagnostic, suffix);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

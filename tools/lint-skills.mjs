import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateType } from 'hanaworlds-contracts';

const manifest = JSON.parse(await readFile(new URL(import.meta.resolve('hanaworlds-contracts/tools'))));
const skillContract = JSON.parse(await readFile(new URL(import.meta.resolve('hanaworlds-contracts/skill'))));
const tools = new Map(manifest.tools.map(tool => [tool.name, tool]));
// This is a vocabulary prohibition, never an alternative tool allowlist.
const engineWords = /\b(?:nodeName|param2(?:Type)?|mapblocks?|flat[\s_-]+mapgen|air|Luanti|Minetest|VoxelManip|MapNode|content_id)\b/gi;

function expand(schema) {
  if (schema.$ref) {
    const name = schema.$ref.replace('#/definitions/', '');
    if (!manifest.definitions[name]) throw new Error(`unresolved published schema: ${name}`);
    return expand(manifest.definitions[name]);
  }
  return schema.oneOf || schema.anyOf ? (schema.oneOf || schema.anyOf).flatMap(expand) : [schema];
}

function fieldExists(tool, direction, path) {
  let candidates = direction === 'input'
    ? expand(tool.inputSchema)
    : [tool.outputSchema, ...tool.actions.map(action => ({ $ref: `#/definitions/${action.output}` }))].flatMap(expand);
  for (const field of path.split('.')) {
    candidates = candidates.flatMap(schema => schema.properties?.[field] ? expand(schema.properties[field]) : []);
    if (!candidates.length) return false;
  }
  return true;
}

export function lintSkill(text, filename) {
  const errors = [];
  const fail = message => errors.push(`${filename}: ${message}`);
  for (const match of text.matchAll(engineWords)) fail(`engine vocabulary: ${match[0]}`);
  const named = new Set(text.match(/hanaworlds_[A-Za-z0-9_]+/g) || []);
  for (const name of named) {
    if (!tools.has(name) || !skillContract.tools.includes(name)) fail(`undeclared tool: ${name}`);
  }
  for (const [, name, action] of text.matchAll(/(hanaworlds_[A-Za-z0-9_]+)\s+action\s+([A-Za-z_]+)/g)) {
    if (!tools.get(name)?.actions.some(item => item.action === action)) fail(`undeclared action: ${name}.${action}`);
  }
  for (const [, name, direction, path] of text.matchAll(/`(hanaworlds_[A-Za-z0-9_]+)\.(input|output)\.([A-Za-z0-9_.]+)`/g)) {
    if (tools.has(name) && !fieldExists(tools.get(name), direction, path)) fail(`unknown field: ${name}.${direction}.${path}`);
  }
  const examples = new Set();
  for (const [, name, body] of text.matchAll(/```json tool=(hanaworlds_[A-Za-z0-9_]+)\s*\n([\s\S]*?)\n```/g)) {
    const tool = tools.get(name);
    if (!tool) continue;
    try {
      const input = JSON.parse(body);
      const action = tool.actions.find(item => item.action === input.action);
      if (!action) throw new Error(`undeclared action ${input.action}`);
      // The published validator checks required, extra, nested and discriminated fields.
      validateType(action.input, input);
      examples.add(name);
    } catch (error) { fail(`invalid input for ${name}: ${error.message}`); }
  }
  for (const name of named) if (tools.has(name) && !examples.has(name)) fail(`missing schema-checked input example: ${name}`);
  for (const fence of text.matchAll(/```([^\n]*)\n/g)) {
    if (fence[1].startsWith('json') && !/^json tool=hanaworlds_[A-Za-z0-9_]+$/.test(fence[1])) {
      fail('JSON examples must name their contract tool');
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let files;
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--skill') throw new Error('usage: lint-skills.mjs [--skill SKILL.md]');
    files = [args[1]];
  } else {
    const root = new URL('../skills/', import.meta.url);
    files = (await readdir(root, { withFileTypes: true })).filter(item => item.isDirectory())
      .map(item => fileURLToPath(new URL(`${item.name}/SKILL.md`, root)));
    if (!files.length) throw new Error('no skills found');
  }
  const errors = [];
  for (const file of files) errors.push(...lintSkill(await readFile(file, 'utf8'), file));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`skills lint passed: ${files.length} skill(s); published contracts ${manifest.version}; tool names, actions, fields and engine vocabulary checked`);
}

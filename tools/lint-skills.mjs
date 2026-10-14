import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validate } from './schema.mjs';

// Model-facing tool structures compiled into this plugin from the published contract
// documents (tools/structures.json); no contract package is read.
const structures = JSON.parse(await readFile(new URL('./structures.json', import.meta.url), 'utf8'));
const { tools, definitions } = structures;
// This is a vocabulary prohibition, never an alternative tool allowlist.
const engineWords = /\b(?:nodeName|param2(?:Type)?|mapblocks?|flat[\s_-]+mapgen|air|Luanti|Minetest|VoxelManip|MapNode|content_id)\b/gi;

function expand(schema) {
  if (schema?.$ref) {
    const name = schema.$ref.replace('#/definitions/', '');
    if (!definitions[name]) throw new Error(`unresolved structure: ${name}`);
    return expand(definitions[name]);
  }
  const alternatives = schema?.oneOf || schema?.anyOf;
  return alternatives ? alternatives.flatMap(expand) : [schema];
}

function actions(tool) {
  return new Set(expand(tool.input).flatMap(schema => {
    const action = schema?.properties?.action;
    if (!action) return [];
    return expand(action).flatMap(s => s.enum ?? ('const' in s ? [s.const] : []));
  }));
}

function fieldExists(tool, path) {
  let candidates = tool.outputs.flatMap(expand);
  for (const field of path.split('.')) {
    candidates = candidates.flatMap(schema => schema?.properties?.[field] ? expand(schema.properties[field])
      : schema?.type === 'array' && schema.items ? expand(schema.items).flatMap(item => item?.properties?.[field] ? expand(item.properties[field]) : []) : []);
    if (!candidates.length) return false;
  }
  return true;
}

export function lintSkill(text, filename) {
  const errors = [];
  const fail = message => errors.push(`${filename}: ${message}`);
  for (const match of text.matchAll(engineWords)) fail(`engine vocabulary: ${match[0]}`);
  const named = new Set(text.match(/hanaworlds_[A-Za-z0-9_]+/g) || []);
  for (const name of named) if (!tools[name]) fail(`undeclared tool: ${name}`);
  for (const [, name, action] of text.matchAll(/(hanaworlds_[A-Za-z0-9_]+)\s+action\s+([A-Za-z_]+)/g)) {
    if (tools[name] && !actions(tools[name]).has(action)) fail(`undeclared action: ${name}.${action}`);
  }
  for (const [, name, path] of text.matchAll(/`(hanaworlds_[A-Za-z0-9_]+)\.output\.([A-Za-z0-9_.]+)`/g)) {
    if (tools[name] && !fieldExists(tools[name], path)) fail(`unknown field: ${name}.output.${path}`);
  }
  const examples = new Set();
  for (const [, name, body] of text.matchAll(/```json tool=(hanaworlds_[A-Za-z0-9_]+)\s*\n([\s\S]*?)\n```/g)) {
    const tool = tools[name];
    if (!tool) continue;
    try {
      const problems = validate(tool.input, JSON.parse(body), definitions);
      if (problems.length) throw new Error(problems.slice(0, 3).join('; '));
      examples.add(name);
    } catch (error) { fail(`invalid input for ${name}: ${error.message}`); }
  }
  for (const name of named) if (tools[name] && !examples.has(name)) fail(`missing schema-checked input example: ${name}`);
  for (const fence of text.matchAll(/```([^\n]*)\n/g)) {
    if (fence[1].startsWith('json') && !/^json tool=hanaworlds_[A-Za-z0-9_]+$/.test(fence[1])) fail('JSON examples must name their contract tool');
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
  else console.log(`skills lint passed: ${files.length} skill(s); local structures from ${Object.keys(structures.provenance).join(', ')}; tool names, actions, fields and engine vocabulary checked`);
}

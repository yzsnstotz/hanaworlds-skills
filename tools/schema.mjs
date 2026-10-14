// Validator for the model-facing tool structures compiled into this plugin
// (tools/structures.json): exactly the keywords those documents use. `defs` resolves
// "#/definitions/<name>". Returns a list of errors; empty means valid.
const type = v => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
const is = (t, v) => t === type(v) || (t === 'number' && type(v) === 'integer');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ANNOTATIONS = new Set(['description', '$comment', 'title']);

export function validate(s, v, defs = {}, path = '$') {
  if (s === true || (s && typeof s === 'object' && !Object.keys(s).some(k => !ANNOTATIONS.has(k) && !k.startsWith('x-') || k === 'x-uniqueBy' || k === 'x-finite'))) return [];
  if (s === false) return [`${path}: not allowed`];
  if (s.$ref) {
    const name = s.$ref.replace('#/definitions/', '');
    if (!defs[name]) return [`${path}: unresolved ${s.$ref}`];
    return validate(defs[name], v, defs, path);
  }
  const e = [];
  if (s.type && ![].concat(s.type).some(t => is(t, v))) return [`${path}: expected ${s.type}, got ${type(v)}`];
  if ('const' in s && !same(s.const, v)) e.push(`${path}: expected const ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.some(x => same(x, v))) e.push(`${path}: not in enum`);
  if (s.oneOf) { const ok = s.oneOf.filter(alt => validate(alt, v, defs, path).length === 0).length; if (ok !== 1) e.push(`${path}: matches ${ok} of ${s.oneOf.length} oneOf alternatives`); }
  if (s.anyOf && !s.anyOf.some(alt => validate(alt, v, defs, path).length === 0)) e.push(`${path}: matches no anyOf alternative`);
  if (typeof v === 'string') {
    if (s.minLength !== undefined && [...v].length < s.minLength) e.push(`${path}: shorter than ${s.minLength}`);
    if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) e.push(`${path}: does not match ${s.pattern}`);
  }
  if (typeof v === 'number') {
    if (s['x-finite'] && !Number.isFinite(v)) e.push(`${path}: not finite`);
    if (s.minimum !== undefined && v < s.minimum) e.push(`${path}: below ${s.minimum}`);
    if (s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum) e.push(`${path}: not above ${s.exclusiveMinimum}`);
    if (s.maximum !== undefined && v > s.maximum) e.push(`${path}: above ${s.maximum}`);
  }
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) e.push(`${path}: fewer than ${s.minItems} items`);
    if (s.maxItems !== undefined && v.length > s.maxItems) e.push(`${path}: more than ${s.maxItems} items`);
    if (s.uniqueItems && new Set(v.map(x => JSON.stringify(x))).size !== v.length) e.push(`${path}: duplicate items`);
    if (Array.isArray(s.items)) {
      v.forEach((x, i) => e.push(...(i < s.items.length ? validate(s.items[i], x, defs, `${path}[${i}]`)
        : s.additionalItems === false ? [`${path}[${i}]: additional item`] : validate(s.additionalItems ?? true, x, defs, `${path}[${i}]`))));
    } else if (s.items) v.forEach((x, i) => e.push(...validate(s.items, x, defs, `${path}[${i}]`)));
    if (s['x-uniqueBy']) {
      const by = [].concat(s['x-uniqueBy']).flatMap(k => String(k).split(','));
      const keys = v.map(x => JSON.stringify(by.map(k => x?.[k])));
      if (new Set(keys).size !== keys.length) e.push(`${path}: duplicate ${by.join(',')}`);
    }
  }
  if (type(v) === 'object') {
    for (const k of s.required || []) if (!Object.hasOwn(v, k)) e.push(`${path}: missing ${k}`);
    if (s.minProperties !== undefined && Object.keys(v).length < s.minProperties) e.push(`${path}: fewer than ${s.minProperties} properties`);
    for (const [k, x] of Object.entries(v)) {
      if (s.propertyNames) e.push(...validate(s.propertyNames, k, defs, `${path}{${k}}`));
      if (s.properties && Object.hasOwn(s.properties, k)) e.push(...validate(s.properties[k], x, defs, `${path}.${k}`));
      else if (s.additionalProperties === false) e.push(`${path}: unknown field ${k}`);
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') e.push(...validate(s.additionalProperties, x, defs, `${path}.${k}`));
    }
  }
  return e;
}

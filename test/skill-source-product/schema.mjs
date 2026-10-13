// Validator for the local C-skill structure (c-skill.schema.json): exactly the
// keywords that structure uses. Returns a list of errors; empty means valid.
const type = v => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
const is = (t, v) => t === type(v) || (t === 'number' && type(v) === 'integer');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function validate(s, v, path = '$') {
  if (s === true || (s && !Object.keys(s).some(k => !['description', '$comment', 'title'].includes(k)))) return [];
  if (s === false) return [`${path}: not allowed`];
  const e = [];
  if (s.type && ![].concat(s.type).some(t => is(t, v))) return [`${path}: expected ${s.type}, got ${type(v)}`];
  if ('const' in s && !same(s.const, v)) e.push(`${path}: expected const ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.some(x => same(x, v))) e.push(`${path}: not in enum`);
  if (s.oneOf) {
    const ok = s.oneOf.filter(alt => validate(alt, v, path).length === 0).length;
    if (ok !== 1) e.push(`${path}: matches ${ok} of ${s.oneOf.length} alternatives`);
  }
  if (typeof v === 'string') {
    if (s.minLength !== undefined && [...v].length < s.minLength) e.push(`${path}: shorter than ${s.minLength}`);
    if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) e.push(`${path}: does not match ${s.pattern}`);
  }
  if (typeof v === 'number') {
    if (s.minimum !== undefined && v < s.minimum) e.push(`${path}: below ${s.minimum}`);
    if (s.maximum !== undefined && v > s.maximum) e.push(`${path}: above ${s.maximum}`);
  }
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) e.push(`${path}: fewer than ${s.minItems} items`);
    if (s.maxItems !== undefined && v.length > s.maxItems) e.push(`${path}: more than ${s.maxItems} items`);
    if (Array.isArray(s.items)) {
      v.forEach((x, i) => e.push(...(i < s.items.length ? validate(s.items[i], x, `${path}[${i}]`)
        : s.additionalItems === false ? [`${path}[${i}]: additional item`] : validate(s.additionalItems ?? true, x, `${path}[${i}]`))));
    } else if (s.items) v.forEach((x, i) => e.push(...validate(s.items, x, `${path}[${i}]`)));
    if (s['x-uniqueBy']) { const keys = v.map(x => JSON.stringify(x?.[s['x-uniqueBy']])); if (new Set(keys).size !== keys.length) e.push(`${path}: duplicate ${s['x-uniqueBy']}`); }
  }
  if (type(v) === 'object') {
    for (const k of s.required || []) if (!Object.hasOwn(v, k)) e.push(`${path}: missing ${k}`);
    if (s.minProperties !== undefined && Object.keys(v).length < s.minProperties) e.push(`${path}: fewer than ${s.minProperties} properties`);
    for (const [k, x] of Object.entries(v)) {
      if (s.propertyNames) e.push(...validate(s.propertyNames, k, `${path}{${k}}`));
      if (s.properties && Object.hasOwn(s.properties, k)) e.push(...validate(s.properties[k], x, `${path}.${k}`));
      else if (s.additionalProperties === false) e.push(`${path}: unknown field ${k}`);
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') e.push(...validate(s.additionalProperties, x, `${path}.${k}`));
    }
  }
  return e;
}

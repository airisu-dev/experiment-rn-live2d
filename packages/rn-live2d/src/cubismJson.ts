// Serializes a parsed Cubism JSON file (model3, physics3, motion3, ...) for the
// Cubism Framework's own JSON parser, which is stricter than JSON:
// - a number must be followed by a newline or a comma, never `}`, `]` or a space
//   (CubismJson::ParseNumeric), so every value goes on its own line;
// - exponents aren't supported, so numbers like 1e-7 are written out in full.
// Files from Cubism Editor already look like this; `JSON.stringify(x)` does not.

const PLACEHOLDER = '\u0000num:'

function plainNumber(n: number): string {
  const s = String(n)
  if (!/e/i.test(s)) return s
  // toFixed(20) keeps far more precision than the Framework's float32 parser reads.
  return n.toFixed(20).replace(/\.?0+$/, '')
}

export function toCubismJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, v) =>
      typeof v === 'number' && /e/i.test(String(v))
        ? PLACEHOLDER + plainNumber(v)
        : v,
    '\t'
  ).replace(/"\\u0000num:([^"]+)"/g, '$1')
}

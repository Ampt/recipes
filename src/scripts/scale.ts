// Scale the leading quantity of an ingredient line, e.g. "1 1/2 cups flour" x2 -> "3 cups flour".

const UNICODE: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
const NUM = String.raw`(?:\d+\s+\d+/\d+|\d+\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+/\d+|\d*\.\d+|\d+|[¼½¾⅓⅔⅛⅜⅝⅞])`;
const LEADING = new RegExp(String.raw`^(\s*(?:<[^>]+>)*\s*)(${NUM})(\s*(?:-|–|to)\s*(${NUM}))?`);

function parse(s: string): number {
  s = s.trim();
  let m;
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + +m[2] / +m[3];
  if ((m = s.match(/^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/))) return +m[1] + UNICODE[m[2]];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return +m[1] / +m[2];
  if (UNICODE[s] !== undefined) return UNICODE[s];
  return parseFloat(s);
}

const FRACTIONS: [number, string][] = [
  [0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, ''],
];

export function format(n: number): string {
  if (n >= 10) return String(Math.round(n));
  const whole = Math.floor(n);
  const frac = n - whole;
  const [value, glyph] = FRACTIONS.reduce((best, f) => (Math.abs(f[0] - frac) < Math.abs(best[0] - frac) ? f : best));
  if (Math.abs(value - frac) > 0.04) return String(Math.round(n * 100) / 100);
  const w = value === 1 ? whole + 1 : whole;
  if (!glyph) return String(w);
  return w ? `${w}${glyph}` : glyph;
}

export function scaleText(html: string, factor: number): string {
  if (factor === 1) return html;
  return html.replace(LEADING, (_all, prefix: string, a: string, range: string | undefined, b: string | undefined) => {
    const first = format(parse(a) * factor);
    return prefix + first + (range && b ? range.replace(b, format(parse(b) * factor)) : '');
  });
}

/**
 * Escaping helpers.
 *
 * This plugin rewrites published HTML with string operations, so every
 * author-supplied value that reaches the document MUST be escaped here
 * first. An unescaped double quote in a page title is enough to break out
 * of a `content="…"` attribute and inject arbitrary markup.
 *
 * Nothing in this file may import host code: it is bundled into the
 * server entrypoint, which runs inside a QuickJS-WASM sandbox with no
 * Node, no Bun, and no host module resolver.
 */

/**
 * Escape a value for interpolation into a double-quoted HTML attribute.
 *
 * `&` must be replaced first, otherwise it would double-escape the
 * ampersands introduced by the later replacements.
 *
 * Single quotes are escaped too. We always emit double-quoted attributes,
 * so `'` is not strictly required, but escaping it keeps the output safe
 * if a caller ever switches quoting style.
 */
export function escapeHtmlAttribute(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Serialise a value for embedding inside a
 * `<script type="application/ld+json">` block.
 *
 * `JSON.stringify` alone is NOT safe here. Inside a script element the
 * HTML tokeniser scans for the literal `</script` sequence and ends the
 * element there, regardless of JSON syntax — so a JSON-LD string
 * containing `</script>` closes the block early and everything after it
 * is parsed as markup. The same tokeniser treats `<!--` specially.
 *
 * Escaping `<` and `>` as `\uXXXX` sequences makes both breakout patterns
 * unrepresentable while leaving the decoded JSON value byte-identical to
 * what a JSON parser would otherwise read. `&` is escaped as well: it is
 * not required (script content is not entity-decoded) but it costs
 * nothing and removes a class of double-decoding surprises.
 *
 * Note that U+2028 / U+2029 deliberately are NOT escaped. They are a
 * hazard only when a string is evaluated as JavaScript; a `ld+json`
 * block is parsed as JSON, where both characters are legal inside a
 * string literal.
 */
export function serialiseJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

/**
 * Collapse whitespace and trim. Meta descriptions authored in a textarea
 * routinely contain newlines, which are legal in an attribute but produce
 * awkward output and inflate the byte count for no benefit.
 */
export function normaliseText(value: string): string {
  return String(value).replace(/\s+/g, ' ').trim()
}

/**
 * Truncate on a word boundary, appending an ellipsis when the value was
 * actually shortened. Used to keep derived descriptions near the length
 * search engines will display rather than emitting a whole article body.
 */
export function truncate(value: string, maxLength: number): string {
  const text = normaliseText(value)
  if (text.length <= maxLength) return text
  const clipped = text.slice(0, maxLength - 1)
  const lastSpace = clipped.lastIndexOf(' ')
  const base = lastSpace > maxLength * 0.6 ? clipped.slice(0, lastSpace) : clipped
  return `${base.replace(/[,;:.\s]+$/, '')}…`
}

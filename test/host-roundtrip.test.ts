/**
 * Round-trip tests against the HOST's real escaping.
 *
 * Every other test in this suite feeds `readPageHtmlContext` a hand-written
 * fixture, and that is precisely how the apostrophe bug shipped: the fixtures
 * spelled `'` as the decimal `&#39;`, a form Instatic never emits. The host
 * escapes `'` to the hexadecimal `&#x27;`, which the decoder did not know, so
 * every apostrophe survived into `escapeHtmlAttribute` and came back out as
 * `&amp;#x27;` — rendered literally, on every page with an apostrophe in its
 * title.
 *
 * So the assertions here start from the host function itself: escape with it,
 * decode with ours, and require the original string back.
 */
import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { applySeoToHtml, decodeHtmlEntities } from '../src/seo'
import { escapeHtmlAttribute } from '../src/escape'

/**
 * A verbatim copy of `escapeHtml` from the CMS's
 * `src/core/html-sanitize/index.ts` (ref `6b055cf7`).
 *
 * Copied rather than imported because the vendored checkout lives in
 * `.instatic/`, which is gitignored — a clean clone has no host source until
 * `bun run setup` has run, and this file must still be meaningful before
 * then. The `stays in step with the vendored host` test below imports the
 * real thing whenever it *is* present, so the copy cannot drift unnoticed.
 */
const HOST_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
}

function hostEscapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HOST_ESCAPE_MAP[ch]!)
}

const HOST_SANITIZE_PATH = new URL(
  '../.instatic/src/core/html-sanitize/index.ts',
  import.meta.url,
).pathname

describe('the host escaper copy above', () => {
  it.skipIf(!existsSync(HOST_SANITIZE_PATH))(
    'stays in step with the vendored host',
    async () => {
      const host = (await import(HOST_SANITIZE_PATH)) as { escapeHtml: (v: unknown) => string }

      // Every code point that could plausibly be escaped, not just the five
      // we know about — a sixth entry added upstream must fail here.
      for (let code = 0; code < 0x100; code += 1) {
        const char = String.fromCharCode(code)
        expect(hostEscapeHtml(char)).toBe(host.escapeHtml(char))
      }
      expect(hostEscapeHtml(`Ada's "Tom & Jerry" <b>`)).toBe(
        host.escapeHtml(`Ada's "Tom & Jerry" <b>`),
      )
    },
  )
})

describe('decodeHtmlEntities against host output', () => {
  it('recovers every character the host escapes', () => {
    const raw = `Ada's "Guide" & <b>Widgets</b> > all`
    const escaped = hostEscapeHtml(raw)

    // Guard the premise: the host really does use the hex form for `'`.
    expect(escaped).toBe(
      'Ada&#x27;s &quot;Guide&quot; &amp; &lt;b&gt;Widgets&lt;/b&gt; &gt; all',
    )
    expect(decodeHtmlEntities(escaped)).toBe(raw)
  })

  it.each([
    ['&#x27;', "'"],
    ['&#X27;', "'"],
    ['&#x0027;', "'"],
    ['&#39;', "'"],
    ['&#039;', "'"],
    ['&#38;', '&'],
    ['&#x3C;', '<'],
    ['&apos;', "'"],
  ])('decodes %s', (entity, expected) => {
    expect(decodeHtmlEntities(entity)).toBe(expected)
  })

  it('does not double-decode: &amp;lt; stays visible text, never a tag', () => {
    // The author typed the literal text `&lt;`; the host escaped its `&`.
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;')
    expect(decodeHtmlEntities('&amp;#x27;')).toBe('&#x27;')
    expect(decodeHtmlEntities('&amp;amp;')).toBe('&amp;')
  })

  it('leaves references it does not recognise exactly as written', () => {
    expect(decodeHtmlEntities('&nbsp;')).toBe('&nbsp;')
    expect(decodeHtmlEntities('&constructor;')).toBe('&constructor;')
    expect(decodeHtmlEntities('&hasOwnProperty;')).toBe('&hasOwnProperty;')
    expect(decodeHtmlEntities('&#x110000;')).toBe('&#x110000;')
    expect(decodeHtmlEntities('&#xD800;')).toBe('&#xD800;')
    expect(decodeHtmlEntities('&amp')).toBe('&amp')
  })
})

describe('the full publish round trip', () => {
  /** A document in the shape Instatic's publisher emits, host-escaped. */
  function published(title: string, description?: string): string {
    const meta = description
      ? `\n  <meta name="description" content="${hostEscapeHtml(description)}">`
      : ''
    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      `  <title>${hostEscapeHtml(title)}</title>${meta}`,
      '</head>',
      '<body><h1>Hello</h1></body>',
      '</html>',
    ].join('\n')
  }

  it('re-emits an apostrophe exactly once, not as &amp;#x27;', () => {
    const html = applySeoToHtml(published("Ada's Guide to Widgets"), {
      record: { pageId: 'p1' },
      settings: { siteUrl: 'https://example.com' },
      slug: 'guide',
    })

    expect(html).toContain('<meta property="og:title" content="Ada&#39;s Guide to Widgets">')
    expect(html).toContain('<meta name="twitter:title" content="Ada&#39;s Guide to Widgets">')
    expect(html).not.toContain('&amp;#x27;')
    expect(html).not.toContain('&amp;#39;')
  })

  it('carries an apostrophe through the description tags and JSON-LD', () => {
    const html = applySeoToHtml(published("Ada's Guide", "Ada's notes on widgets"), {
      record: { pageId: 'p1', jsonLdType: 'Article' },
      settings: { siteUrl: 'https://example.com' },
      slug: 'guide',
    })

    expect(html).toContain('<meta name="description" content="Ada&#39;s notes on widgets">')
    expect(html).toContain(
      '<meta property="og:description" content="Ada&#39;s notes on widgets">',
    )
    expect(html).toContain(
      '<meta name="twitter:description" content="Ada&#39;s notes on widgets">',
    )
    expect(html).toContain('"headline":"Ada\'s Guide"')
    expect(html).not.toContain('&amp;#x27;')
  })

  it('survives a title built from every character the host escapes', () => {
    const raw = `Ada's "Guide" & <b>Widgets</b>`
    const html = applySeoToHtml(published(raw), {
      record: { pageId: 'p1' },
      settings: { siteUrl: 'https://example.com' },
      slug: 'guide',
    })

    // What lands in the attribute is exactly what our own escaper produces
    // for the original string — no residue of the host's encoding.
    expect(html).toContain(
      `<meta property="og:title" content="${escapeHtmlAttribute(raw)}">`,
    )
    expect(html).not.toContain('&amp;#x27;')
    expect(html).not.toContain('&amp;quot;')
    expect(html).not.toContain('&amp;lt;')
    expect(html).not.toContain('&amp;gt;')
    expect(html).not.toContain('&amp;amp;')
  })

  it('does not decode markup the author typed as visible text', () => {
    // The author's title is the literal seven characters `<b>bold`.
    const html = applySeoToHtml(published('<b>bold'), {
      record: { pageId: 'p1' },
      settings: { siteUrl: 'https://example.com' },
      slug: 'guide',
    })

    expect(html).toContain('<meta property="og:title" content="&lt;b&gt;bold">')
  })
})

import { describe, expect, it } from 'bun:test'
import {
  applySeoToHtml,
  buildOrganizationJsonLd,
  buildSeoHead,
  injectSeoHead,
  readPageHtmlContext,
  resolveCanonical,
  resolveSeoValues,
  resolveUrl,
  stripHostDescription,
} from '../src/seo'
import type { PageSeoRecord, SeoSiteSettings } from '../src/types'

const SETTINGS: SeoSiteSettings = {
  siteUrl: 'https://example.com',
  organizationName: 'Acme Inc',
  organizationLogo: '/logo.png',
  twitterSite: '@acme',
  emitOrganization: true,
}

/** A realistic document in the shape Instatic's publisher emits. */
function hostHtml(options: { title?: string; description?: string } = {}): string {
  const title = options.title ?? 'A Page Title'
  const description = options.description
    ? `\n  <meta name="description" content="${options.description}">`
    : ''
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${title}</title>${description}`,
    '</head>',
    '<body><h1>Hello</h1></body>',
    '</html>',
  ].join('\n')
}

describe('readPageHtmlContext', () => {
  it('reads the title and description the host already rendered', () => {
    const context = readPageHtmlContext(hostHtml({ description: 'Site wide blurb' }))
    expect(context.title).toBe('A Page Title')
    expect(context.description).toBe('Site wide blurb')
  })

  it('decodes entities so values can be safely re-escaped', () => {
    const context = readPageHtmlContext(hostHtml({ title: 'Tom &amp; &quot;Jerry&quot;' }))
    expect(context.title).toBe('Tom & "Jerry"')
  })

  it('returns an empty context for a document with no head metadata', () => {
    expect(readPageHtmlContext('<html><body>hi</body></html>')).toEqual({})
  })
})

describe('resolveUrl', () => {
  it('passes absolute URLs through', () => {
    expect(resolveUrl('https://cdn.test/a.png', 'https://example.com')).toBe(
      'https://cdn.test/a.png',
    )
  })

  it('resolves a site-relative path against the site URL', () => {
    expect(resolveUrl('/a.png', 'https://example.com')).toBe('https://example.com/a.png')
  })

  it('does not double the slash when the site URL has a trailing one', () => {
    expect(resolveUrl('/a.png', 'https://example.com/')).toBe('https://example.com/a.png')
  })

  it('returns null for a relative value with no site URL, rather than a broken tag', () => {
    expect(resolveUrl('/a.png', undefined)).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(resolveUrl('', 'https://example.com')).toBeNull()
  })
})

describe('resolveCanonical', () => {
  it('prefers an authored canonical', () => {
    expect(resolveCanonical('https://other.test/x', 'ignored', 'https://example.com')).toBe(
      'https://other.test/x',
    )
  })

  it('derives from the slug when none is authored', () => {
    expect(resolveCanonical(undefined, 'about', 'https://example.com')).toBe(
      'https://example.com/about',
    )
  })

  it('maps an index slug to the site root', () => {
    expect(resolveCanonical(undefined, 'index', 'https://example.com')).toBe(
      'https://example.com/',
    )
  })

  it('returns null without a site URL', () => {
    expect(resolveCanonical(undefined, 'about', undefined)).toBeNull()
  })
})

describe('resolveSeoValues fallbacks', () => {
  it('falls back to the rendered title when og:title is blank', () => {
    const values = resolveSeoValues({
      record: { pageId: 'p1', ogTitle: '' },
      settings: SETTINGS,
      html: { title: 'Rendered Title' },
    })
    expect(values.title).toBe('Rendered Title')
  })

  it('falls back from og:description to the meta description', () => {
    const values = resolveSeoValues({
      record: { pageId: 'p1', metaDescription: 'Page level blurb' },
      settings: SETTINGS,
      html: {},
    })
    expect(values.ogDescription).toBe('Page level blurb')
  })

  it('falls back to the site-wide description the host rendered', () => {
    const values = resolveSeoValues({
      record: null,
      settings: SETTINGS,
      html: { description: 'Site wide blurb' },
    })
    expect(values.description).toBe('Site wide blurb')
  })

  it('falls back to the default og:image', () => {
    const values = resolveSeoValues({
      record: { pageId: 'p1' },
      settings: { ...SETTINGS, defaultOgImage: '/default.png' },
      html: {},
    })
    expect(values.image).toBe('https://example.com/default.png')
  })

  it('switches og:type to article when structured data says so', () => {
    const values = resolveSeoValues({
      record: { pageId: 'p1', jsonLdType: 'BlogPosting' },
      settings: SETTINGS,
      html: {},
    })
    expect(values.ogType).toBe('article')
  })

  it('downgrades the twitter card when there is no image', () => {
    const values = resolveSeoValues({ record: null, settings: { siteUrl: 'https://e.test' }, html: {} })
    expect(values.twitterCard).toBe('summary')
  })
})

describe('buildSeoHead', () => {
  it('emits no empty tags when everything is blank', () => {
    const block = buildSeoHead({
      record: { pageId: 'p1', ogTitle: '', metaDescription: '', ogImage: '' },
      settings: {},
      html: {},
    })
    expect(block).toBe('')
  })

  it('omits og:image entirely rather than emitting an empty one', () => {
    const block = buildSeoHead({
      record: { pageId: 'p1', ogTitle: 'T' },
      settings: { siteUrl: 'https://example.com' },
      html: {},
    })
    expect(block).not.toContain('og:image')
  })

  it('escapes a hostile title everywhere it is interpolated', () => {
    const record: PageSeoRecord = {
      pageId: 'p1',
      ogTitle: '" onload="alert(1)',
      jsonLdType: 'Article',
    }
    const block = buildSeoHead({ record, settings: SETTINGS, html: {} })
    expect(block).toContain('&quot; onload=&quot;alert(1)')
    expect(block).not.toContain('" onload="alert(1)')
  })

  it('emits canonical, open graph, twitter and JSON-LD together', () => {
    const record: PageSeoRecord = {
      pageId: 'p1',
      metaDescription: 'A description',
      ogImage: '/hero.png',
      jsonLdType: 'Article',
      author: 'Jane Doe',
      publishedAt: '2026-01-01T00:00:00Z',
    }
    const block = buildSeoHead({
      record,
      settings: SETTINGS,
      html: { title: 'Hello' },
      slug: 'hello',
    })
    expect(block).toContain('<link rel="canonical" href="https://example.com/hello">')
    expect(block).toContain('<meta property="og:title" content="Hello">')
    expect(block).toContain('<meta property="og:image" content="https://example.com/hero.png">')
    expect(block).toContain('<meta name="twitter:card" content="summary_large_image">')
    expect(block).toContain('"@type":"Article"')
    expect(block).toContain('"name":"Jane Doe"')
  })

  it('emits a robots noindex directive when asked', () => {
    const block = buildSeoHead({
      record: { pageId: 'p1', noindex: true, ogTitle: 'X' },
      settings: SETTINGS,
      html: {},
    })
    expect(block).toContain('<meta name="robots" content="noindex, nofollow">')
  })
})

describe('buildOrganizationJsonLd', () => {
  it('is omitted when not enabled', () => {
    expect(buildOrganizationJsonLd({ ...SETTINGS, emitOrganization: false })).toBeNull()
  })

  it('is omitted when no organization name is configured', () => {
    expect(buildOrganizationJsonLd({ emitOrganization: true })).toBeNull()
  })

  it('resolves the logo to an absolute URL', () => {
    const node = buildOrganizationJsonLd(SETTINGS)
    expect(node?.logo).toBe('https://example.com/logo.png')
  })
})

describe('stripHostDescription', () => {
  it('removes the site-wide description the host rendered', () => {
    const stripped = stripHostDescription(hostHtml({ description: 'Site wide' }))
    expect(stripped).not.toContain('name="description"')
    expect(stripped).toContain('<title>')
  })
})

describe('injectSeoHead', () => {
  it('inserts the block immediately before </head>', () => {
    const output = injectSeoHead(hostHtml(), '<!-- instatic-plugin-seo:start -->\n<meta name="x" content="y">\n<!-- instatic-plugin-seo:end -->')
    expect(output.indexOf('<meta name="x"')).toBeLessThan(output.indexOf('</head>'))
  })

  it('returns the document unchanged when there is no </head>', () => {
    const fragment = '<div>no head here</div>'
    expect(injectSeoHead(fragment, '<!-- instatic-plugin-seo:start -->\n<meta name="x" content="y">\n<!-- instatic-plugin-seo:end -->')).toBe(fragment)
  })

  it('does not strip the host description when it cannot insert a replacement', () => {
    // No `</head>`, so nothing is inserted. Removing the host's description
    // anyway would leave the page with no description at all.
    const fragment = '<meta name="description" content="Site wide"><div>no head</div>'
    const block =
      '<!-- instatic-plugin-seo:start -->\n<meta name="description" content="Per page">\n<!-- instatic-plugin-seo:end -->'
    expect(injectSeoHead(fragment, block)).toBe(fragment)
  })
})

describe('applySeoToHtml', () => {
  const record: PageSeoRecord = {
    pageId: 'p1',
    metaDescription: 'Per page description',
    jsonLdType: 'Article',
  }

  it('replaces the host description with the per-page one', () => {
    const output = applySeoToHtml(hostHtml({ description: 'Site wide' }), {
      record,
      settings: SETTINGS,
      slug: 'hello',
    })
    expect(output).toContain('content="Per page description"')
    expect(output).not.toContain('content="Site wide"')
    expect(output.match(/name="description"/g)?.length).toBe(1)
  })

  it('is idempotent — running twice does not duplicate the block', () => {
    const once = applySeoToHtml(hostHtml(), { record, settings: SETTINGS, slug: 'hello' })
    const twice = applySeoToHtml(once, { record, settings: SETTINGS, slug: 'hello' })
    expect(twice).toBe(once)
    expect(twice.match(/og:title/g)?.length).toBe(1)
  })

  it('leaves the document untouched when there is nothing to add', () => {
    const bare = '<html><head><title></title></head><body></body></html>'
    expect(applySeoToHtml(bare, { record: null, settings: {}, slug: '' })).toBe(bare)
  })

  it('still emits title tags for a page with no metadata and no settings', () => {
    // Pinning the real behaviour: "nothing authored" is not a no-op. The
    // title fallback fires on every page that has a <title>, which is every
    // page — deriving og:title from it is the point of the fallback chain.
    const bare = '<html><head><title>Plain Title</title></head><body></body></html>'
    const output = applySeoToHtml(bare, { record: null, settings: {}, slug: '' })

    expect(output).not.toBe(bare)
    expect(output).toContain('<meta property="og:title" content="Plain Title">')
    expect(output).toContain('<meta name="twitter:title" content="Plain Title">')
    // Nothing resolved a description, a canonical, or an image, so those
    // tags stay omitted rather than being emitted empty.
    expect(output).not.toContain('name="description"')
    expect(output).not.toContain('rel="canonical"')
    expect(output).not.toContain('og:image')
  })

  it('preserves the rest of the document byte-for-byte', () => {
    const input = hostHtml()
    const output = applySeoToHtml(input, { record, settings: SETTINGS, slug: 'hello' })
    expect(output).toContain('<body><h1>Hello</h1></body>')
    expect(output).toContain('<meta charset="utf-8">')
  })
})

/**
 * Pure SEO/AEO head-block construction.
 *
 * Everything here is a pure function of its inputs — no host API, no I/O,
 * no globals. That keeps the interesting logic testable with `bun test`
 * outside a running CMS, and keeps the sandboxed server bundle small.
 *
 * Design rule: a blank authored field means "fall back", never "emit an
 * empty tag". An empty `og:title` is worse than no `og:title` at all, so
 * every builder below omits a tag whose resolved value is empty.
 */

import { escapeHtmlAttribute, normaliseText, serialiseJsonLd, truncate } from './escape'
import type { PageHtmlContext, SeoBuildInput, SeoSiteSettings } from './types'

/** Marks the block this plugin owns, so a republish replaces rather than appends. */
export const BLOCK_START = '<!-- instatic-plugin-seo:start -->'
export const BLOCK_END = '<!-- instatic-plugin-seo:end -->'

/** Search engines truncate well before this; keep derived text tidy. */
const MAX_DESCRIPTION_LENGTH = 160

// ---------------------------------------------------------------------------
// Reading values back out of rendered HTML
// ---------------------------------------------------------------------------

/**
 * Decode the small set of named entities the host's own escaping can
 * produce, so a title round-tripped through `<title>` compares and
 * re-escapes correctly. `&amp;` is decoded last to avoid turning
 * `&amp;lt;` into `<`.
 */
export function decodeHtmlEntities(value: string): string {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Pull the page title and any existing meta description out of the
 * rendered document.
 *
 * These regexes are deliberately narrow. They read two specific tags the
 * host emits in a known shape rather than attempting to parse HTML — the
 * sandbox has no DOM, and a real parser is not worth 64MB of heap for two
 * values. A miss degrades to "no fallback available", which is safe.
 */
export function readPageHtmlContext(html: string): PageHtmlContext {
  const context: PageHtmlContext = {}

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (titleMatch && titleMatch[1]) {
    const title = normaliseText(decodeHtmlEntities(titleMatch[1]))
    if (title) context.title = title
  }

  const descriptionMatch =
    /<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']\s*\/?>/i.exec(html)
  if (descriptionMatch && descriptionMatch[1]) {
    const description = normaliseText(decodeHtmlEntities(descriptionMatch[1]))
    if (description) context.description = description
  }

  return context
}

// ---------------------------------------------------------------------------
// URL handling
// ---------------------------------------------------------------------------

/** Strip trailing slashes so `siteUrl` concatenation never doubles them. */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

/**
 * Resolve a possibly-relative URL against the configured site URL.
 *
 * Absolute URLs (including protocol-relative) pass through untouched. A
 * relative value with no configured `siteUrl` returns null: emitting a
 * relative `og:image` is pointless because crawlers resolve it against
 * their own origin, so omitting the tag is the honest outcome.
 *
 * `URL` is not used here — the QuickJS sandbox does not guarantee it, and
 * string concatenation is sufficient for the two shapes we accept.
 */
export function resolveUrl(value: string | undefined, siteUrl?: string): string | null {
  const raw = normaliseText(value ?? '')
  if (!raw) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return raw

  const base = trimTrailingSlash(normaliseText(siteUrl ?? ''))
  if (!base) return null
  return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`
}

/**
 * Build the canonical URL for a page: the authored value when present,
 * otherwise the site URL joined to the page slug.
 *
 * An empty or `index`/`home` slug is treated as the site root.
 */
export function resolveCanonical(
  authored: string | undefined,
  slug: string | undefined,
  siteUrl: string | undefined,
): string | null {
  const explicit = resolveUrl(authored, siteUrl)
  if (explicit) return explicit

  const base = trimTrailingSlash(normaliseText(siteUrl ?? ''))
  if (!base) return null

  const cleanSlug = normaliseText(slug ?? '').replace(/^\/+|\/+$/g, '')
  if (!cleanSlug || cleanSlug === 'index' || cleanSlug === 'home') return `${base}/`
  return `${base}/${cleanSlug}`
}

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------

/** `<meta name="…" content="…">`, or nothing when the value is empty. */
function metaName(name: string, value: string | null | undefined): string | null {
  const text = normaliseText(value ?? '')
  if (!text) return null
  return `<meta name="${escapeHtmlAttribute(name)}" content="${escapeHtmlAttribute(text)}">`
}

/** `<meta property="…" content="…">`, or nothing when the value is empty. */
function metaProperty(property: string, value: string | null | undefined): string | null {
  const text = normaliseText(value ?? '')
  if (!text) return null
  return `<meta property="${escapeHtmlAttribute(property)}" content="${escapeHtmlAttribute(text)}">`
}

// ---------------------------------------------------------------------------
// Resolution — authored value, then fallback chain
// ---------------------------------------------------------------------------

/**
 * Collapse the authored record, the site settings, and the values read
 * from the rendered HTML into the final set of values to emit.
 *
 * Exported so tests can assert the fallback chain directly, without
 * going through string rendering.
 */
export function resolveSeoValues(input: SeoBuildInput) {
  const record = input.record ?? { pageId: '' }
  const settings: SeoSiteSettings = input.settings ?? {}
  const siteUrl = settings.siteUrl

  // Title falls back to whatever the host rendered into <title>. Note
  // that Instatic substitutes the SITE-wide `metaTitle` for every page
  // when it is set, so this fallback can be the same string on every
  // page — which is exactly the situation an authored og:title fixes.
  const title = normaliseText(record.ogTitle ?? '') || input.html.title || ''

  // Description falls back to the site-wide description the host
  // rendered, when one exists.
  const description =
    normaliseText(record.metaDescription ?? '') || input.html.description || ''

  const ogDescription =
    normaliseText(record.ogDescription ?? '') || description || ''

  const canonical = resolveCanonical(record.canonicalUrl, input.slug, siteUrl)

  const image =
    resolveUrl(record.ogImage, siteUrl) ?? resolveUrl(settings.defaultOgImage, siteUrl)

  const jsonLdType = record.jsonLdType ?? 'none'

  // og:type follows the structured-data choice unless explicitly overridden:
  // a page emitting Article JSON-LD but og:type=website is contradictory.
  const ogType =
    normaliseText(record.ogType ?? '') || (jsonLdType === 'none' ? 'website' : 'article')

  const ogUrl = resolveUrl(record.ogUrl, siteUrl) ?? canonical

  // A large-image card with no image renders as a plain summary anyway,
  // so pick the style that matches what we can actually supply.
  const twitterCard = record.twitterCard ?? (image ? 'summary_large_image' : 'summary')

  return {
    title,
    description: description ? truncate(description, MAX_DESCRIPTION_LENGTH) : '',
    ogDescription: ogDescription ? truncate(ogDescription, MAX_DESCRIPTION_LENGTH) : '',
    canonical,
    image,
    ogType,
    ogUrl,
    twitterCard,
    jsonLdType,
    noindex: record.noindex === true,
    publishedAt: normaliseText(record.publishedAt ?? ''),
    modifiedAt: normaliseText(record.modifiedAt ?? ''),
    author: normaliseText(record.author ?? ''),
    settings,
  }
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

/** Drop empty/undefined members so the emitted graph has no null noise. */
function compact(object: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(object)) {
    const value = object[key]
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && !value) continue
    if (Array.isArray(value) && value.length === 0) continue
    out[key] = value
  }
  return out
}

/**
 * Build the Article / BlogPosting node for a page, or null when the page
 * does not opt in or lacks the headline every article type requires.
 */
export function buildArticleJsonLd(
  values: ReturnType<typeof resolveSeoValues>,
): Record<string, unknown> | null {
  if (values.jsonLdType === 'none') return null
  if (!values.title) return null

  const publisher = values.settings.organizationName
    ? compact({
        '@type': 'Organization',
        name: values.settings.organizationName,
        logo: resolveUrl(values.settings.organizationLogo, values.settings.siteUrl)
          ? compact({
              '@type': 'ImageObject',
              url: resolveUrl(values.settings.organizationLogo, values.settings.siteUrl),
            })
          : undefined,
      })
    : undefined

  return compact({
    '@context': 'https://schema.org',
    '@type': values.jsonLdType,
    headline: values.title,
    description: values.ogDescription || values.description || undefined,
    image: values.image ?? undefined,
    datePublished: values.publishedAt || undefined,
    dateModified: values.modifiedAt || values.publishedAt || undefined,
    author: values.author ? compact({ '@type': 'Person', name: values.author }) : undefined,
    publisher,
    mainEntityOfPage: values.canonical
      ? compact({ '@type': 'WebPage', '@id': values.canonical })
      : undefined,
  })
}

/**
 * Build the site-wide Organization node, or null when the site has not
 * configured a name or has opted out.
 */
export function buildOrganizationJsonLd(
  settings: SeoSiteSettings,
): Record<string, unknown> | null {
  if (!settings.emitOrganization) return null
  const name = normaliseText(settings.organizationName ?? '')
  if (!name) return null

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    url: resolveUrl(settings.siteUrl, settings.siteUrl) ?? undefined,
    logo: resolveUrl(settings.organizationLogo, settings.siteUrl) ?? undefined,
  })
}

// ---------------------------------------------------------------------------
// Head block
// ---------------------------------------------------------------------------

/**
 * Render the complete block of tags this plugin owns.
 *
 * Returns an empty string when there is nothing worth emitting, so a page
 * with no metadata and no site settings stays byte-identical to what the
 * host produced.
 */
export function buildSeoHead(input: SeoBuildInput): string {
  const values = resolveSeoValues(input)
  const tags: Array<string | null> = []

  if (values.noindex) tags.push(metaName('robots', 'noindex, nofollow'))

  tags.push(metaName('description', values.description))

  if (values.canonical) {
    tags.push(`<link rel="canonical" href="${escapeHtmlAttribute(values.canonical)}">`)
  }

  // `og:type` and `twitter:card` describe how the OTHER tags should be
  // interpreted, so they are only meaningful alongside real content. A
  // page with nothing to share would otherwise still get a lone
  // `og:type="website"`, which is noise on every page of the site.
  const openGraph = [
    metaProperty('og:title', values.title),
    metaProperty('og:description', values.ogDescription),
    metaProperty('og:url', values.ogUrl),
    metaProperty('og:image', values.image),
  ].filter((tag): tag is string => Boolean(tag))

  if (openGraph.length > 0) {
    tags.push(metaProperty('og:type', values.ogType))
    tags.push(...openGraph)
    tags.push(metaProperty('og:site_name', values.settings.organizationName))
  }

  const twitter = [
    metaName('twitter:title', values.title),
    metaName('twitter:description', values.ogDescription),
    metaName('twitter:image', values.image),
  ].filter((tag): tag is string => Boolean(tag))

  if (twitter.length > 0) {
    tags.push(metaName('twitter:card', values.twitterCard))
    tags.push(metaName('twitter:site', values.settings.twitterSite))
    tags.push(...twitter)
  }

  const article = buildArticleJsonLd(values)
  if (article) {
    tags.push(`<script type="application/ld+json">${serialiseJsonLd(article)}</script>`)
  }

  const organization = buildOrganizationJsonLd(values.settings)
  if (organization) {
    tags.push(`<script type="application/ld+json">${serialiseJsonLd(organization)}</script>`)
  }

  const rendered = tags.filter((tag): tag is string => Boolean(tag))
  if (rendered.length === 0) return ''

  return [BLOCK_START, ...rendered, BLOCK_END].join('\n')
}

// ---------------------------------------------------------------------------
// Injection
// ---------------------------------------------------------------------------

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Remove a previously injected block so republishing never stacks duplicates. */
export function stripExistingBlock(html: string): string {
  const pattern = new RegExp(
    `\\n?${escapeRegExp(BLOCK_START)}[\\s\\S]*?${escapeRegExp(BLOCK_END)}\\n?`,
    'g',
  )
  return html.replace(pattern, '')
}

/**
 * Remove the host's site-wide `<meta name="description">`.
 *
 * Instatic renders `SiteSettingsSchema.metaDescription` into every page.
 * Once this plugin emits a per-page description, leaving the site-wide one
 * in place would produce two competing description tags on the same
 * document, and which one wins is up to the crawler.
 */
export function stripHostDescription(html: string): string {
  return html.replace(
    /\n?[ \t]*<meta\s+name=["']description["']\s+content=["'][\s\S]*?["']\s*\/?>/gi,
    '',
  )
}

/**
 * Insert the plugin's block into the document head.
 *
 * Injection is idempotent: any previous block is removed first, so the
 * filter is safe to run repeatedly over already-published HTML.
 *
 * When the document has no `</head>` — an unusual fragment, but the filter
 * value is whatever earlier stages produced, so it is not guaranteed — the
 * HTML is returned unchanged rather than guessing at a position.
 */
export function injectSeoHead(html: string, block: string): string {
  const withoutPrevious = stripExistingBlock(html)
  if (!block) return withoutPrevious

  const emitsDescription = /<meta name="description"/.test(block)
  const base = emitsDescription ? stripHostDescription(withoutPrevious) : withoutPrevious

  const headCloseIndex = base.search(/<\/head\s*>/i)
  if (headCloseIndex === -1) return base

  // Normalise the whitespace immediately before `</head>` so the result
  // does not drift between runs. Without this, stripping a previous
  // block consumes the newline that preceded it and the next injection
  // produces a byte-different — though visually identical — document.
  const before = base.slice(0, headCloseIndex).replace(/\s*$/, '')
  return `${before}\n${block}\n${base.slice(headCloseIndex)}`
}

/**
 * End-to-end transform used by the `publish.html` filter: read what the
 * page already has, build the block, and splice it in.
 */
export function applySeoToHtml(
  html: string,
  input: Omit<SeoBuildInput, 'html'>,
): string {
  const context = readPageHtmlContext(html)
  const block = buildSeoHead({ ...input, html: context })
  return injectSeoHead(html, block)
}

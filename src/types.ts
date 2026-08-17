/**
 * Shared types for the SEO/AEO metadata plugin.
 *
 * `PageSeoRecord` is the shape stored in the plugin's own `cms.storage`
 * collection, one record per CMS page. The built-in `pages` table cannot be
 * extended by a plugin (the host exposes list/get/create on tables but no
 * update), so per-page metadata lives here instead, keyed by `pageId`.
 */

/** JSON-LD document types this plugin knows how to emit for a page. */
export type JsonLdType = 'none' | 'Article' | 'BlogPosting'

/** Twitter card rendering styles. */
export type TwitterCardType = 'summary' | 'summary_large_image'

/**
 * Per-page metadata authored in the plugin's admin page.
 *
 * Every field is optional. A blank field is not an instruction to emit an
 * empty tag — it means "fall back", and the resolver derives a value from
 * the page's own rendered `<title>` / description, or omits the tag when
 * nothing sensible exists.
 */
export interface PageSeoRecord {
  /** CMS page id this record describes. The storage lookup key. */
  pageId: string
  /** Page slug, stored for display in the admin list. */
  slug?: string
  /** `<meta name="description">` for this page. */
  metaDescription?: string
  /** Absolute or site-relative canonical URL. Relative values are resolved against the site URL. */
  canonicalUrl?: string
  /** `og:title`. Falls back to the page's `<title>`. */
  ogTitle?: string
  /** `og:description`. Falls back to `metaDescription`, then the page description. */
  ogDescription?: string
  /** `og:image`. Absolute or site-relative; resolved against the site URL. */
  ogImage?: string
  /** `og:type`. Defaults to `website`, or `article` when a JSON-LD article type is selected. */
  ogType?: string
  /** `og:url`. Falls back to the canonical URL. */
  ogUrl?: string
  /** Twitter card style. Defaults to `summary_large_image` when an image exists. */
  twitterCard?: TwitterCardType
  /** Structured-data type to emit for this page. */
  jsonLdType?: JsonLdType
  /** ISO 8601 publish date, used by Article/BlogPosting JSON-LD. */
  publishedAt?: string
  /** ISO 8601 modified date, used by Article/BlogPosting JSON-LD. */
  modifiedAt?: string
  /** Author name for Article/BlogPosting JSON-LD. */
  author?: string
  /** When true, emit `<meta name="robots" content="noindex, nofollow">`. */
  noindex?: boolean
}

/**
 * Site-wide values, sourced from the plugin's declarative settings.
 *
 * These are read once per publish and applied to every page, providing the
 * defaults that per-page records fall back to.
 */
export interface SeoSiteSettings {
  /** Site origin, e.g. `https://example.com`. Required to emit absolute URLs. */
  siteUrl?: string
  /** Organization name for the Organization JSON-LD block and article publisher. */
  organizationName?: string
  /** Absolute or site-relative logo URL for Organization JSON-LD. */
  organizationLogo?: string
  /** Default `og:image` for pages that do not set their own. */
  defaultOgImage?: string
  /** `twitter:site` handle, e.g. `@acme`. */
  twitterSite?: string
  /** Emit an Organization JSON-LD block on every page. */
  emitOrganization?: boolean
}

/**
 * Values recovered from the already-rendered page HTML.
 *
 * The `publish.html` filter receives the finished document, so the page's
 * own title and any site-wide description the host emitted are available
 * for free — no extra permissions and no second data source to keep in
 * sync.
 */
export interface PageHtmlContext {
  /** Text content of the page's `<title>` element, entity-decoded. */
  title?: string
  /** Content of an existing `<meta name="description">`, entity-decoded. */
  description?: string
}

/** Everything the tag builder needs to produce a page's SEO head block. */
export interface SeoBuildInput {
  record: PageSeoRecord | null
  settings: SeoSiteSettings
  html: PageHtmlContext
  /** Page slug from the publish hook context, used to derive a canonical URL. */
  slug?: string
}

/**
 * instatic-plugin-seo — SEO/AEO metadata for Instatic.
 *
 * Instatic ships no Open Graph, no canonical link, and no JSON-LD, and its
 * only meta description is site-wide. This plugin adds per-page metadata
 * and injects it into published HTML through the `publish.html` filter.
 *
 * Build with:
 *   bun run <instatic>/src/core/plugin-sdk/cli/index.ts build .
 */
import { definePlugin, permissions } from '@core/plugin-sdk'

export default definePlugin({
  id: 'wyre.seo',
  name: 'SEO & AEO Metadata',
  version: '0.1.0',
  description:
    'Per-page meta description, canonical URL, Open Graph, Twitter cards, and JSON-LD structured data for published pages.',
  author: { name: 'WYRE', url: 'https://github.com/WYRE-AI' },
  license: 'MIT',
  repository: 'https://github.com/WYRE-AI/instatic-plugin-seo',
  keywords: ['seo', 'aeo', 'open-graph', 'json-ld', 'metadata', 'schema-org'],

  permissions: [
    // Register the `publish.html` filter. This is the only mechanism that
    // can add per-page tags to published output, and it is HIGH RISK: the
    // filter receives the entire rendered document and its return value is
    // used verbatim. See the README for the full trust discussion.
    permissions.cmsHooks,
    // Per-page metadata records. The plugin keeps its own collection
    // because a plugin cannot add a field to the built-in `pages` table:
    // the RPC surface exposes only `cms.content.tables.list/get/create`
    // (`server/plugins/protocol/targets.ts:68-70`), so no operation to
    // update a table schema exists at all. It is a missing operation, not
    // a permission that could be granted.
    permissions.cmsStorage,
    // Register the admin page in the sidebar.
    permissions.adminNavigation,
    // Required for an `app`-kind admin page: it runs unsandboxed in the
    // admin window, sharing the host's React instance.
    permissions.editorCode,
  ],

  // NOTE: this plugin deliberately does NOT declare `cms.content.read`.
  // Instatic v0.0.16 requires a manifest-level `contentAccess[]` allowlist
  // alongside any `cms.content.*` permission, but `definePlugin()` has no
  // field for it and drops it, so a plugin built with the official CLI and
  // declaring that permission fails its own `lint` and cannot install:
  //   "`contentAccess` is required when any `cms.content.*` permission is
  //    granted."
  // The admin page reads the page list through the host's existing
  // `/admin/api/cms/pages` endpoint instead, which is gated by the signed-in
  // user's `site.read` capability rather than a plugin permission.

  /**
   * Per-page metadata storage.
   *
   * Every field that should persist MUST be declared here — the host's
   * `validatePluginRecordData` copies only declared fields and silently
   * drops anything else.
   *
   * Field ids are camelCase on purpose: storage `filter` / `orderBy` keys
   * are validated against `/^[a-zA-Z_][a-zA-Z0-9_]*$/`, which rejects the
   * dashes the manifest would otherwise allow. `pageId` is the lookup key,
   * so it must be filterable.
   */
  resources: [
    {
      id: 'page-seo',
      title: 'Page SEO',
      singularLabel: 'Page SEO record',
      pluralLabel: 'Page SEO records',
      fields: [
        { id: 'pageId', label: 'Page ID', type: 'text', required: true },
        { id: 'slug', label: 'Slug', type: 'text' },
        { id: 'metaDescription', label: 'Meta description', type: 'longtext' },
        { id: 'canonicalUrl', label: 'Canonical URL', type: 'text' },
        { id: 'ogTitle', label: 'Open Graph title', type: 'text' },
        { id: 'ogDescription', label: 'Open Graph description', type: 'longtext' },
        { id: 'ogImage', label: 'Open Graph image', type: 'text' },
        { id: 'ogType', label: 'Open Graph type', type: 'text' },
        { id: 'ogUrl', label: 'Open Graph URL', type: 'text' },
        { id: 'twitterCard', label: 'Twitter card', type: 'text' },
        { id: 'jsonLdType', label: 'Structured data type', type: 'text' },
        { id: 'publishedAt', label: 'Published date', type: 'date' },
        { id: 'modifiedAt', label: 'Modified date', type: 'date' },
        { id: 'author', label: 'Author', type: 'text' },
        { id: 'noindex', label: 'Exclude from search engines', type: 'boolean' },
      ],
    },
  ],

  /**
   * Site-wide defaults. Read server-side with `api.cms.settings.get(key)`.
   *
   * `siteUrl` is the important one: without it the plugin cannot build
   * absolute canonical or image URLs, and it omits those tags rather than
   * emitting relative values that crawlers resolve against their own host.
   */
  settings: [
    {
      id: 'siteUrl',
      label: 'Site URL',
      type: 'url',
      description:
        'Public origin of the site, e.g. https://example.com. Required for canonical URLs and absolute image URLs.',
    },
    {
      id: 'organizationName',
      label: 'Organization name',
      type: 'text',
      description: 'Used for og:site_name, the article publisher, and Organization structured data.',
    },
    {
      id: 'organizationLogo',
      label: 'Organization logo URL',
      type: 'text',
      description: 'Absolute or site-relative. Used in Organization structured data.',
    },
    {
      id: 'defaultOgImage',
      label: 'Default share image',
      type: 'text',
      description: 'Fallback og:image for pages that do not set their own.',
    },
    {
      id: 'twitterSite',
      label: 'Twitter / X handle',
      type: 'text',
      placeholder: '@example',
      description: 'Emitted as twitter:site.',
    },
    {
      id: 'emitOrganization',
      label: 'Emit Organization structured data',
      type: 'toggle',
      default: false,
      description: 'Adds an Organization JSON-LD block to every published page.',
    },
  ],

  adminPages: [
    {
      id: 'page-seo',
      title: 'SEO & AEO',
      navLabel: 'SEO',
      content: {
        kind: 'app',
        heading: 'Per-page SEO metadata',
        // Points at the BUILT path; the CLI resolves `admin/seo.tsx`.
        entry: 'admin/seo.js',
      },
    },
  ],
})

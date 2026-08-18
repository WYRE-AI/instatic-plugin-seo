# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Apostrophes in a page title or description were published double-encoded.
  The host escapes `'` to the hexadecimal `&#x27;`, but `decodeHtmlEntities`
  knew only the decimal `&#39;`, so the apostrophe survived decoding and the
  stray `&` was escaped again — `Ada's Guide` shipped as `Ada&amp;#x27;s Guide`
  and rendered literally as `Ada&#x27;s Guide`. This affected `og:title`,
  `twitter:title`, `og:description`, `twitter:description`, the meta
  description, and the JSON-LD `headline` on every page whose title or
  description contained an apostrophe. Over-escaping is the safe direction —
  it was never an injection risk — but it corrupted the exact tags this plugin
  exists to produce.
- `decodeHtmlEntities` now decodes numeric character references generically
  (decimal `&#N;` and hexadecimal `&#xN;`, with or without leading zeros) in a
  single pass over one alternation, so the next character added to the host's
  escape map cannot reproduce this class of bug. The single pass is
  load-bearing: a chain of `.replace()` calls decodes `&amp;lt;` all the way to
  `<`, silently un-escaping markup an author typed as visible text.
  Unrecognised names, code points past the end of Unicode, and lone surrogates
  are left exactly as written.
- `injectSeoHead` no longer strips the host's `<meta name="description">` when
  the document has no `</head>` to insert a replacement into. The page kept
  losing its description and gaining nothing.

### Changed

- README no longer claims the plugin is byte-identical on pages with no
  metadata. It is not, and cannot be: `og:title` and `twitter:title` fall back
  to the page's own `<title>`, so installing the plugin adds a block to every
  page. The 160-character description truncation — which applies to authored
  descriptions, not just derived ones — is now documented too.

### Added

- `test/host-roundtrip.test.ts`, which escapes with the host's real
  `escapeHtml` and requires the original string back. The apostrophe bug
  shipped because every existing test fed the decoder a hand-written fixture
  using the decimal form the host never emits.

## [0.1.0] - 2026-08-17

### Added

- Per-page meta description, injected into published HTML through the
  `publish.html` filter hook.
- Canonical URL, derived from the configured site URL and the page slug when
  not authored explicitly.
- Open Graph tags: `og:title`, `og:description`, `og:type`, `og:url`,
  `og:image`, and `og:site_name`.
- Twitter card tags: `twitter:card`, `twitter:site`, `twitter:title`,
  `twitter:description`, and `twitter:image`. The card style defaults to
  `summary_large_image` when an image is available and `summary` otherwise.
- JSON-LD structured data: `Article` / `BlogPosting` per page, plus an
  optional site-wide `Organization` block.
- `noindex` toggle emitting `<meta name="robots" content="noindex, nofollow">`.
- Admin page for authoring per-page metadata, built on the host's design-system
  primitives.
- Plugin settings for site URL, organization name and logo, default share
  image, Twitter handle, and the Organization structured-data toggle.
- Fallback chain so blank fields degrade gracefully instead of emitting empty
  tags — authored value, then the page's own rendered title or the site-wide
  description, then omission.
- Seeding of new records from the built-in `seoTitle` / `seoDescription` page
  cells, which Instatic collects in the Content editor but never publishes.
- `bun run setup` to vendor the pinned Instatic checkout the SDK requires.
- Test suite covering escaping, URL resolution, the fallback chain, tag
  construction, HTML injection, and record round-tripping.

### Security

- All interpolated values are HTML-attribute escaped before reaching the
  document.
- JSON-LD is serialised with `<`, `>`, and `&` escaped as `\uXXXX` sequences, so
  a `</script>` sequence in author-supplied text cannot break out of the
  structured-data block.

[Unreleased]: https://github.com/WYRE-AI/instatic-plugin-seo/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/WYRE-AI/instatic-plugin-seo/releases/tag/v0.1.0

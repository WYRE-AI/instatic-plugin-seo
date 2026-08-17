# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

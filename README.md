# instatic-plugin-seo

Per-page SEO and AEO metadata for the [Instatic](https://github.com/corebunch/instatic) CMS —
meta description, canonical URL, Open Graph, Twitter cards, and JSON-LD structured data.

## Why this exists

Instatic ships no per-page metadata of any kind. Verified against the source at commit
`6b055cf` (v0.0.16 + 3 commits):

- **No Open Graph.** A repo-wide search for `og:title` / `og:image` / `property="og` returns
  zero hits.
- **No canonical link.** Zero hits for `rel="canonical"`.
- **No JSON-LD.** Zero hits for `ld+json`.
- **The meta description is site-wide only.** `src/core/publisher/render.ts:318` renders
  `settings.metaDescription` from `SiteSettingsSchema` — one description shared by every
  page. The `<title>` is similarly built from the site-wide `settings.metaTitle` when set,
  falling back to the page title (`render.ts:326`).
- **Per-page SEO fields are collected and then discarded.** The built-in `pages` table
  already defines `seoTitle` and `seoDescription` cells, and the Content editor exposes
  both. Nothing in `src/core/publisher/` or `server/publish/` ever reads them, so text an
  author carefully wrote never reaches the published document.

That last point is the one worth internalising: the CMS asks for per-page SEO copy and
then throws it away. This plugin publishes it.

## What it emits

For each published page, as available:

| Tag | Source |
| --- | --- |
| `<meta name="description">` | Authored value, else the site-wide description |
| `<link rel="canonical">` | Authored value, else site URL + page slug |
| `og:title` / `og:description` / `og:type` / `og:url` / `og:image` / `og:site_name` | Authored values with fallbacks |
| `twitter:card` / `twitter:site` / `twitter:title` / `twitter:description` / `twitter:image` | Authored values with fallbacks |
| `<script type="application/ld+json">` | `Article` / `BlogPosting` per page, optional site-wide `Organization` |
| `<meta name="robots" content="noindex, nofollow">` | Per-page toggle |

Blank fields **fall back rather than emit empty tags**. If nothing resolves for a given
tag, that tag is omitted entirely rather than emitted empty.

### It is not a no-op on pages with no metadata

`og:title` and `twitter:title` fall back to the `<title>` the host already rendered, and
every published page has one. So a page with **nothing authored and no site settings**
still gets a four-tag block:

```html
<!-- instatic-plugin-seo:start -->
<meta property="og:type" content="website">
<meta property="og:title" content="Plain Title">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Plain Title">
<!-- instatic-plugin-seo:end -->
```

That is the intended behaviour — a page sharing with no `og:title` is the problem this
plugin exists to fix, and the page title is the best available answer. But it does mean
**installing this plugin changes every page on the site**, not only the pages you author
metadata for. The output is byte-identical to the input only when nothing resolves at all:
a document with no `<title>` (or an empty one), no site-wide description, and no authored
record. Re-running the filter over already-published HTML *is* byte-identical, because the
marked block is stripped and rebuilt.

### Descriptions are truncated to 160 characters

`<meta name="description">`, `og:description`, `twitter:description`, and the JSON-LD
`description` are all clipped to 160 characters on a word boundary with a trailing `…`.
This applies to **authored** descriptions too, not just ones derived from page content —
write a 200-character description and 160 characters are what get published. 160 is close
to what search results display; if you need the full text in `og:description`, this is the
line to change (`MAX_DESCRIPTION_LENGTH` in `src/seo.ts`).

## Requirements

- **Bun** 1.3.x (Instatic pins `>=1.3.0 <1.4.0`).
- **A local Instatic checkout.** The plugin SDK is *not* published to npm — see below.
- A running Instatic instance to install into.

### The SDK is not on npm

`@instatic/plugin-sdk` does not exist on the npm registry (`npm view @instatic/plugin-sdk`
returns 404), and neither does an `instatic-plugin` CLI package. Both live inside the CMS
repository:

- The CLI is a repo script: `"instatic-plugin": "bun run src/core/plugin-sdk/cli/index.ts"`.
- `@instatic/plugin-sdk` is a **browser import-map** name (`index.html`), resolved at
  runtime to `/runtime/plugin-sdk.js`. It is not a resolvable package at build time.
- The CLI's own `instatic-plugin init` scaffolds `import … from '@core/plugin-sdk'` — the
  repo-internal TypeScript path alias — not the `@instatic/plugin-sdk` name the docs show.

Building a plugin therefore requires a checkout of the CMS. `bun run setup` vendors one
into `.instatic/` (gitignored) at the pinned commit and installs its dependencies, and
`tsconfig.json` maps `@core/*` and `@instatic/*` into it. That mapping is also what gives
the admin page real host component prop types instead of hand-written guesses.

## Build

```bash
bun install
bun run setup      # clone + install the pinned Instatic checkout into .instatic/
bun run lint       # manifest + sandbox validation
bun run test       # unit tests (no checkout needed)
bun run typecheck
bun run build      # → dist/ and ../instatic-plugin-seo.plugin.zip
```

Actual output of `bun run build`:

```
✓ Built wyre.seo
  dist: …/instatic-plugin-seo/dist
  zip:  …/instatic-plugin-seo.plugin.zip
```

Note the zip is written to the **parent** directory — that is the CLI's behaviour
(`<dir-parent>/<plugin-dir-name>.plugin.zip`), not a misconfiguration.

`bun run test` needs neither `.instatic/` nor a running CMS: all logic worth testing is in
pure functions under `src/`, which import nothing from the host.

## Install

1. Run `bun run build`.
2. In the Instatic admin, go to **Plugins → Upload Plugin** and upload
   `instatic-plugin-seo.plugin.zip`.
3. Approve the four permissions at the install prompt (install is all-or-nothing).
4. Open **Plugins → SEO & AEO Metadata → Settings** and set at least the **Site URL**.
   Without it, canonical and absolute image URLs are omitted rather than emitted as
   relative values that crawlers would resolve against their own origin.
5. Open the **SEO** page in the sidebar, pick a page, fill in what you want, and save.
6. **Publish the page.** Nothing appears until you do — see the preview caveat below.

For iterating locally, `bun run dev` writes builds straight into a running host's
`uploads/plugins/<id>/<version>/` directory; point it at the host with
`--uploads <path>` or `INSTATIC_UPLOADS_DIR`.

## Permissions, and why each is needed

| Permission | Risk | Why |
| --- | --- | --- |
| `cms.hooks` | **high** | Register the `publish.html` filter. This is the only mechanism that can add per-page tags to published output. |
| `cms.storage` | medium | Persist per-page metadata in the plugin's own record collection. |
| `admin.navigation` | low | Register the SEO page in the admin sidebar. |
| `editor.code` | **high** | Required for an `app`-kind admin page — it runs unsandboxed in the admin window. |

### `cms.hooks` deserves scrutiny before you grant it

Be clear-eyed about what this permission means, because it is the most powerful thing this
plugin asks for.

A `publish.html` filter receives **the entire rendered document** for every page, and its
return value is used **verbatim**. From `src/core/plugins/hookBus.ts`:

```ts
const next = await entry.handler(current, context)
current = next
```

There is no type check, no length check, and no HTML validation between a filter's return
value and what is written to disk and served to visitors. The filter runs **last** in
`server/publish/publishedHtmlPipeline.ts:61`, after frontend-asset injection, form-token
stamping, and module script tags — so whatever it returns is final. A plugin with
`cms.hooks` can rewrite, replace, or empty any page on the site.

This plugin's filter is deliberately narrow: it reads the document's existing `<title>` and
description, splices a marked block before `</head>`, and returns the input unchanged on
any error. But *the permission* grants far more than this plugin uses, and that is what you
are approving. Read `server/index.ts` — it is short — before granting it.

`editor.code` is likewise high-risk: app-kind admin pages are not sandboxed and run with
full access to the admin window. Only the admin UI uses it; the publish path does not.

### Why not `frontend.assets`?

`frontend.assets[]` looks like a lower-privilege alternative, and for site-wide tags it is.
It cannot do this job, for two independent reasons — both verified in
`server/publish/frontendInjections.ts`:

1. **It is site-wide.** Declared assets are injected into *every* published page. Canonical
   URLs, per-page descriptions, and per-page Open Graph are by definition per-page.
2. **The attributes needed are stripped.** `formatAttrs` (line 284) drops a reserved set
   from the author-supplied `attrs` object:

   ```ts
   const RESERVED = new Set(['src', 'href', 'rel', 'data-plugin-id', 'defer', 'async', 'type'])
   ```

   The `kind: 'link'` branch (lines 220–227) renders `<link${extra}${pluginAttr}>` and
   supplies no `rel` or `href` of its own, so with both stripped from `attrs` a canonical
   link cannot be expressed at all. `type` is stripped too, which means a JSON-LD block
   declared this way would lose `type="application/ld+json"` and be parsed as **executable
   JavaScript** rather than data.

So `publish.html` is not a shortcut here; it is the only correct mechanism.

## Known caveats and limitations

### The editor preview never shows these tags

`server/publish/runtime/previewRuntime.ts:105` documents this explicitly: the preview
iframe does not fire `publish.before` / `publish.html` / `publish.after`, because those
"mutate persisted state and aren't safe to run on every keystroke."

**Consequence:** nothing this plugin does is visible in the editor canvas. Metadata appears
only on published, live, or baked output. This reads as a bug the first time you hit it —
it is not. Verify with **View Source** on the published page, not the preview.

### Metadata lives beside the page, not on it

A plugin cannot add a field to the built-in `pages` table. The RPC surface exposes only
`cms.content.tables.list`, `.get`, and `.create`
(`server/plugins/protocol/targets.ts:68-70`) — there is no operation that updates a table
schema, so this is a missing capability rather than a permission that could be granted.
Per-page metadata therefore lives in the plugin's own `page-seo` collection, keyed by
`pageId`.

**Consequence:** deleting a page does not delete its SEO record. Orphans are harmless — the
filter only ever looks up the page currently being published — but they are not cleaned up.

### `cms.content.read` is unusable in this SDK version, by design of a bug

This plugin does **not** read page content server-side, which would otherwise let it fall
back to each page's `seoDescription` automatically. That is not a design preference; it is
not currently possible with the official toolchain:

- `parsePluginManifest` requires a `contentAccess[]` allowlist whenever any `cms.content.*`
  permission is declared (`src/core/plugins/manifest.ts:566-570`).
- `definePlugin()` has no `contentAccess` field and drops it from the emitted manifest
  (`src/core/plugin-sdk/builders/definePlugin.ts:169-191`).

A plugin declaring `cms.content.read` and built with `instatic-plugin build` therefore
fails the CLI's own lint and cannot install:

```
✗ [manifest] Invalid plugin manifest: `contentAccess` is required when any
  `cms.content.*` permission is granted. List the tables the plugin can touch.
```

That output is from this repository's config with the permission added — the failure was
reproduced, not inferred. Rather than hand-patch `dist/plugin.json` and diverge from the
official build output, the plugin works within the constraint:

- The **admin page** reads pages through the host's own `/admin/api/cms/pages` endpoint,
  which is gated by the signed-in user's `site.read` capability rather than a plugin
  permission, and pre-fills a new record from that page's `seoTitle` / `seoDescription`.
- The **server filter** reads only its own storage.

**Consequence:** existing per-page SEO copy is adopted when you open a page in the SEO
admin and save it — once per page — rather than automatically for the whole site. If
upstream adds `contentAccess` to `definePlugin`, the automatic path becomes a small change.

### Other limitations

- **Publish-time only.** Tags reflect the metadata at publish. Editing metadata does not
  retroactively change already-published pages; republish to apply.
- **One `<meta name="description">`.** When this plugin emits a description it strips the
  host's site-wide one, so pages do not carry two competing description tags.
- **Injection is idempotent.** The emitted block is delimited by
  `<!-- instatic-plugin-seo:start -->` / `:end` markers and any prior block is removed
  before a new one is inserted, so re-running the filter over already-published HTML does
  not stack duplicates.
- **No sitemap or robots.txt.** Out of scope; this plugin only writes page `<head>` tags.
- **Dates are stored as strings.** The host's `date` field type performs no parsing, so
  `publishedAt` / `modifiedAt` are passed through to JSON-LD as entered. Use ISO 8601.
- **No image validation.** An `og:image` URL is resolved to an absolute URL and escaped,
  but the plugin does not verify it exists or check its dimensions.

## Security notes

This plugin rewrites HTML with string operations, so escaping is load-bearing rather than
decorative.

- Every interpolated value passes through `escapeHtmlAttribute`, which escapes `&`, `<`,
  `>`, `"`, and `'` — ampersand first, so later replacements are not double-encoded. An
  unescaped quote in a page title would otherwise break out of a `content="…"` attribute.
- Values read back out of the rendered page are decoded by `decodeHtmlEntities` before
  being re-escaped. It decodes numeric references **generically** — decimal `&#39;` and
  hexadecimal `&#x27;` alike — because the host spells `'` as the hex form, and it does so
  in a **single pass** over one alternation so `&amp;lt;` decodes to the visible text
  `&lt;` and stops rather than being carried the rest of the way to `<`. Unknown names,
  code points past the end of Unicode, and lone surrogates are left as written.
  `test/host-roundtrip.test.ts` asserts this against the host's own `escapeHtml` rather
  than a hand-written fixture — a fixture is what let an over-encoding bug ship.
- JSON-LD is serialised with `<`, `>`, and `&` escaped as `\uXXXX`. `JSON.stringify` alone
  is **not** sufficient: inside a script element the HTML tokeniser scans for the literal
  `</script` sequence regardless of JSON syntax, so a `</script>` in author text would
  close the block early and inject markup. The escaped form is byte-identical to a JSON
  parser.
- The server bundle contains none of the literals `assertSandboxSafe` rejects (`node:`,
  `bun:`, `require(`, `process.binding`, `globalThis.process.env`), which the build and the
  install handler both verify.
- The plugin declares no `network.outbound` permission and makes no outbound requests.
  (Note that `fetch` *is* available in the sandbox to plugins that declare that permission
  along with a `networkAllowedHosts` allowlist; this one does not.)

Escaping behaviour is covered by tests, including hostile-input cases for both attribute
breakout and `</script>` breakout.

## Verification status

What was verified, and how:

| Claim | Status |
| --- | --- |
| SDK absent from npm | Verified — `npm view` 404 for `@instatic/plugin-sdk` and `instatic-plugin` |
| CLI exists and runs | Verified — `--help`, `init`, `lint`, `build` all executed |
| Out-of-repo build works with a paths mapping | Verified — built this plugin |
| `bun run lint` passes | Verified — `✓ wyre.seo: no issues found` |
| `bun run build` succeeds | Verified — output quoted above |
| Server bundle is sandbox-clean | Verified — zero forbidden literals in `dist/server/index.js` |
| Admin bundle shares host React | Verified — `react` left as a bare import in `dist/admin/seo.js` |
| `contentAccess` gap | Verified — reproduced the lint failure |
| `formatAttrs` strips `rel` / `href` / `type` | Verified — read at `frontendInjections.ts:284` |
| Instatic emits no OG / canonical / JSON-LD | Verified — zero-hit greps over the checkout |
| `seoTitle` / `seoDescription` never published | Verified — no reader in `src/core/publisher/` or `server/publish/` |
| Tags render correctly on a live Instatic instance | **NOT verified** — no running instance was available |

The last row matters: this plugin has **not** been installed into a running Instatic
instance. Its logic is unit-tested and it builds and lints cleanly against the real SDK,
but the end-to-end path — upload, approve, author, publish, inspect source — has not been
exercised.

## Development

```
src/            pure logic — escaping, URL resolution, tag building, injection
server/         the publish.html filter (QuickJS sandbox)
admin/          the admin authoring page (unsandboxed, host React)
test/           unit tests
scripts/        setup and typecheck helpers
```

`src/` imports nothing from the host, which is what keeps it testable without a checkout
and small enough to inline into the sandboxed bundle.

## License

MIT — matching Instatic. See [LICENSE](./LICENSE).

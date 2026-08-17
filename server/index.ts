/**
 * Server entrypoint.
 *
 * Runs inside the host's QuickJS-WASM sandbox: no Node, no Bun, no file
 * system, no environment variables, no network. The bundle is fully
 * inlined (sandboxed bundles get no externals) and scanned for forbidden
 * literals, so this file and everything it imports must stay pure JS.
 *
 * Its whole job is one filter: rewrite each published page's HTML to
 * carry the metadata authored on the plugin's admin page.
 */
import { applySeoToHtml } from '../src/seo'
import { RESOURCE_ID, recordFromStorageData } from '../src/record'
import type { PageSeoRecord, SeoSiteSettings } from '../src/types'

/**
 * Structural types for the host surfaces this file touches.
 *
 * Declared locally rather than imported from the SDK so the server
 * entrypoint type-checks against exactly the contract it relies on. The
 * SDK's own `ServerPluginApi` is the authority; this is a narrowed view
 * of it.
 */
interface StorageRecord {
  id: string
  data: Record<string, unknown>
}

/** Context the host passes to a `publish.html` filter, minus `pluginId`. */
interface PublishHtmlContext {
  pluginId: string
  siteId: string
  pageId: string
  slug: string
}

interface ServerApi {
  plugin: { log: (...args: unknown[]) => void }
  cms: {
    hooks: {
      filter: (
        name: string,
        handler: (value: string, context: PublishHtmlContext) => string | Promise<string>,
      ) => void
    }
    storage: {
      collection: (resourceId: string) => {
        list: (options?: Record<string, unknown>) => Promise<{
          records: StorageRecord[]
          totalCount: number
        }>
      }
    }
    settings: {
      get: <T extends string | number | boolean = string>(key: string) => T | undefined
    }
  }
}

/**
 * Collect the plugin's site-wide settings.
 *
 * Read on every page rather than cached at activation: the host pushes
 * saved settings into the running VM immediately, so reading late means
 * an edited Site URL takes effect on the next publish without a reload.
 */
function readSettings(api: ServerApi): SeoSiteSettings {
  const get = api.cms.settings.get
  return {
    siteUrl: get<string>('siteUrl'),
    organizationName: get<string>('organizationName'),
    organizationLogo: get<string>('organizationLogo'),
    defaultOgImage: get<string>('defaultOgImage'),
    twitterSite: get<string>('twitterSite'),
    emitOrganization: get<boolean>('emitOrganization') === true,
  }
}

/**
 * Look up this page's metadata record.
 *
 * Plugin storage has no `get(id)` — reads go through `list` with a
 * filter — so a page with no authored metadata returns no records and
 * the caller falls back to whatever the document already carries.
 */
async function loadRecord(api: ServerApi, pageId: string): Promise<PageSeoRecord | null> {
  const result = await api.cms.storage
    .collection(RESOURCE_ID)
    .list({ filter: { pageId }, limit: 1 })
  const first = result.records[0]
  return first ? recordFromStorageData(first.data) : null
}

export function activate(api: ServerApi): void {
  /**
   * Inject the SEO block into every published page.
   *
   * This filter runs LAST in `publishedHtmlPipeline.ts` — after frontend
   * asset injection, form-token stamping, and module script tags — so the
   * value received here is the finished document, and the string returned
   * is what ships to disk and to visitors.
   *
   * Failure policy: return the input untouched. The host's `applyFilter`
   * already catches and keeps the previous value on a throw, but being
   * explicit means a malformed record degrades to "no SEO tags on this
   * page" rather than risking the page itself.
   */
  api.cms.hooks.filter('publish.html', async (html, context) => {
    try {
      const record = await loadRecord(api, context.pageId)
      return applySeoToHtml(html, {
        record,
        settings: readSettings(api),
        slug: context.slug,
      })
    } catch (error) {
      api.plugin.log(`[wyre.seo] skipped page ${context.pageId}: ${String(error)}`)
      return html
    }
  })

  const siteUrl = readSettings(api).siteUrl
  api.plugin.log(
    siteUrl
      ? '[wyre.seo] activated'
      : '[wyre.seo] activated without a Site URL — canonical and absolute image tags stay off until one is set',
  )
}

export function deactivate(api: ServerApi): void {
  api.plugin.log('[wyre.seo] deactivated')
}

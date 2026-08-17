/**
 * Admin page — author per-page SEO metadata.
 *
 * This bundle runs UNSANDBOXED in the admin window (hence the
 * `editor.code` permission). It shares the host's React instance and
 * design-system primitives through the admin import map, so it must not
 * bundle its own React.
 *
 * Data flow:
 *   • page list — the host's own `/admin/api/cms/pages` endpoint, gated by
 *     the signed-in user's `site.read` capability. Using it avoids the
 *     `cms.content.read` permission entirely (see the note in
 *     `instatic-plugin.config.ts` for why that permission is unusable).
 *   • records   — the host's plugin resource-record REST endpoints.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Heading,
  Input,
  Select,
  Separator,
  Stack,
  Switch,
  Text,
  Textarea,
} from '@instatic/host-ui'
import { definePluginAdminApp } from '@instatic/plugin-sdk'
import { usePluginContext } from '@instatic/host-hooks'
import { RESOURCE_ID, recordFromStorageData, storageDataFromRecord } from '../src/record'
import type { PageSeoRecord } from '../src/types'

interface PageSummary {
  id: string
  slug: string
  title: string
  /** Built-in per-page SEO cells, used to seed a brand-new record. */
  seoTitle: string
  seoDescription: string
}

interface StoredRecord {
  id: string
  data: Record<string, unknown>
}

/** A row as returned by `GET /admin/api/cms/pages`. */
interface PageRow {
  id: string
  slug: string
  cells?: Record<string, unknown>
}

function cellText(cells: Record<string, unknown> | undefined, key: string): string {
  const value = cells?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

/** Base path for the host's plugin-record REST endpoints. */
function recordsPath(pluginId: string): string {
  return `/admin/api/cms/plugins/${encodeURIComponent(pluginId)}/resources/${encodeURIComponent(
    RESOURCE_ID,
  )}/records`
}

const EMPTY_RECORD: PageSeoRecord = { pageId: '' }

function SeoAdminApp(): React.ReactElement {
  const { pluginId } = usePluginContext()

  const [pages, setPages] = useState<PageSummary[]>([])
  const [selectedPageId, setSelectedPageId] = useState('')
  const [draft, setDraft] = useState<PageSeoRecord>(EMPTY_RECORD)
  const [recordId, setRecordId] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // ---- load the page list -------------------------------------------------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch('/admin/api/cms/pages', { credentials: 'include' })
        if (!response.ok) throw new Error(`Could not load pages (${response.status})`)
        const body = (await response.json()) as { rows?: PageRow[] }
        if (cancelled) return
        const list: PageSummary[] = (body.rows ?? []).map((row) => ({
          id: row.id,
          slug: row.slug,
          title: cellText(row.cells, 'title') || row.slug || 'Untitled',
          seoTitle: cellText(row.cells, 'seoTitle'),
          seoDescription: cellText(row.cells, 'seoDescription'),
        }))
        setPages(list)
        setSelectedPageId((current) => current || list[0]?.id || '')
        setStatus('idle')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('idle')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? null,
    [pages, selectedPageId],
  )

  // ---- load the record for the selected page ------------------------------
  useEffect(() => {
    if (!selectedPageId) return
    let cancelled = false
    setStatus('loading')
    setSaved(false)
    ;(async () => {
      try {
        const query = new URLSearchParams({
          filter: JSON.stringify({ pageId: selectedPageId }),
          limit: '1',
        })
        const response = await fetch(`${recordsPath(pluginId)}?${query}`, {
          credentials: 'include',
        })
        if (!response.ok) throw new Error(`Could not load metadata (${response.status})`)
        const body = (await response.json()) as { records?: StoredRecord[] }
        if (cancelled) return
        const existing = body.records?.[0]
        setRecordId(existing?.id ?? null)
        if (existing) {
          setDraft(recordFromStorageData(existing.data))
        } else {
          // Seed a new record from the page's built-in SEO cells. Instatic
          // collects `seoTitle` / `seoDescription` in the Content editor
          // but its publisher never emits them, so this is usually real
          // metadata the author already wrote and has never seen shipped.
          const page = pages.find((candidate) => candidate.id === selectedPageId)
          setDraft({
            ...EMPTY_RECORD,
            pageId: selectedPageId,
            ...(page?.seoTitle ? { ogTitle: page.seoTitle } : {}),
            ...(page?.seoDescription ? { metaDescription: page.seoDescription } : {}),
          })
        }
        setError(null)
        setStatus('idle')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('idle')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedPageId, pluginId, pages])

  const update = useCallback(<K extends keyof PageSeoRecord>(key: K, value: PageSeoRecord[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }, [])

  const save = useCallback(async () => {
    if (!selectedPageId) return
    setStatus('saving')
    setError(null)
    try {
      const payload = storageDataFromRecord({
        ...draft,
        pageId: selectedPageId,
        slug: selectedPage?.slug ?? draft.slug,
      })
      const response = await fetch(
        recordId ? `${recordsPath(pluginId)}/${encodeURIComponent(recordId)}` : recordsPath(pluginId),
        {
          method: recordId ? 'PATCH' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: payload }),
        },
      )
      if (!response.ok) throw new Error(`Save failed (${response.status})`)
      const body = (await response.json()) as { record?: StoredRecord; id?: string }
      const nextId = body.record?.id ?? body.id ?? recordId
      setRecordId(nextId ?? null)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStatus('idle')
    }
  }, [draft, pluginId, recordId, selectedPage, selectedPageId])

  if (pages.length === 0 && status !== 'loading') {
    return (
      <Stack gap={16}>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <EmptyState
          title="No pages found"
          body="Create a page in the CMS, then return here to add its SEO metadata."
        />
      </Stack>
    )
  }

  return (
    <Stack gap={24}>
      <Alert tone="info">
        These tags are written into published HTML only. The editor canvas preview does not run
        the publish pipeline, so changes here appear on the live page after you publish — not in
        the preview.
      </Alert>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {saved ? <Alert tone="success">Saved. Publish the page to apply the changes.</Alert> : null}

      <Card>
        <Stack gap={16}>
          <Heading level={3}>Page</Heading>
          <Select
            label="Page"
            value={selectedPageId}
            onChange={setSelectedPageId}
            options={pages.map((page) => ({
              label: `${page.title} (/${page.slug})`,
              value: page.id,
            }))}
          />
          <Text variant="muted">
            Blank fields fall back automatically — to this page&rsquo;s built-in SEO title and
            description, then to the site defaults. Nothing empty is ever written to the page.
          </Text>
        </Stack>
      </Card>

      <Card>
        <Stack gap={16}>
          <Heading level={3}>Search</Heading>
          <Textarea
            label="Meta description"
            rows={3}
            value={draft.metaDescription ?? ''}
            onChange={(value: string) => update('metaDescription', value)}
            placeholder="Around 150 characters describing this page."
          />
          <Input
            label="Canonical URL"
            value={draft.canonicalUrl ?? ''}
            onChange={(value: string) => update('canonicalUrl', value)}
            placeholder="Leave blank to derive from the site URL and page slug."
          />
          <Switch
            label="Exclude from search engines (noindex)"
            checked={draft.noindex === true}
            onChange={(value: boolean) => update('noindex', value)}
          />
        </Stack>
      </Card>

      <Card>
        <Stack gap={16}>
          <Heading level={3}>Social sharing</Heading>
          <Input
            label="Open Graph title"
            value={draft.ogTitle ?? ''}
            onChange={(value: string) => update('ogTitle', value)}
            placeholder="Defaults to the page title."
          />
          <Textarea
            label="Open Graph description"
            rows={2}
            value={draft.ogDescription ?? ''}
            onChange={(value: string) => update('ogDescription', value)}
            placeholder="Defaults to the meta description."
          />
          <Input
            label="Share image URL"
            value={draft.ogImage ?? ''}
            onChange={(value: string) => update('ogImage', value)}
            placeholder="Absolute, or site-relative like /images/share.png"
          />
          <Select
            label="Twitter card"
            value={draft.twitterCard ?? ''}
            onChange={(value: string) => update('twitterCard', value as PageSeoRecord['twitterCard'])}
            options={[
              { label: 'Automatic', value: '' },
              { label: 'Summary', value: 'summary' },
              { label: 'Summary with large image', value: 'summary_large_image' },
            ]}
          />
        </Stack>
      </Card>

      <Card>
        <Stack gap={16}>
          <Heading level={3}>Structured data</Heading>
          <Select
            label="Type"
            value={draft.jsonLdType ?? 'none'}
            onChange={(value: string) => update('jsonLdType', value as PageSeoRecord['jsonLdType'])}
            options={[
              { label: 'None', value: 'none' },
              { label: 'Article', value: 'Article' },
              { label: 'Blog posting', value: 'BlogPosting' },
            ]}
          />
          <Input
            label="Author"
            value={draft.author ?? ''}
            onChange={(value: string) => update('author', value)}
          />
          <Input
            label="Published date"
            value={draft.publishedAt ?? ''}
            onChange={(value: string) => update('publishedAt', value)}
            placeholder="2026-01-31"
          />
          <Input
            label="Modified date"
            value={draft.modifiedAt ?? ''}
            onChange={(value: string) => update('modifiedAt', value)}
            placeholder="2026-02-14"
          />
        </Stack>
      </Card>

      <Separator />

      <Stack direction="row" gap={8}>
        <Button variant="primary" onClick={save} disabled={status !== 'idle' || !selectedPageId}>
          {status === 'saving' ? 'Saving…' : 'Save metadata'}
        </Button>
      </Stack>
    </Stack>
  )
}

export default definePluginAdminApp(SeoAdminApp)

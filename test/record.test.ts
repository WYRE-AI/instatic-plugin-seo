import { describe, expect, it } from 'bun:test'
import { RESOURCE_ID, recordFromStorageData, storageDataFromRecord } from '../src/record'
import type { PageSeoRecord } from '../src/types'

/**
 * Every key this mapping writes must be declared in the manifest's
 * `resources[].fields`, because the host silently drops undeclared keys.
 * This list mirrors `instatic-plugin.config.ts` — if the two drift, a
 * field would vanish on save with no error anywhere.
 */
const DECLARED_FIELDS = [
  'pageId',
  'slug',
  'metaDescription',
  'canonicalUrl',
  'ogTitle',
  'ogDescription',
  'ogImage',
  'ogType',
  'ogUrl',
  'twitterCard',
  'jsonLdType',
  'publishedAt',
  'modifiedAt',
  'author',
  'noindex',
]

describe('resource id', () => {
  it('matches the host slug pattern', () => {
    expect(RESOURCE_ID).toMatch(/^[a-z][a-z0-9-]*$/)
  })
})

describe('storageDataFromRecord', () => {
  it('writes only fields declared in the manifest', () => {
    const data = storageDataFromRecord({ pageId: 'p1' })
    expect(Object.keys(data).sort()).toEqual([...DECLARED_FIELDS].sort())
  })

  it('uses filterable, dash-free key names', () => {
    // Storage filter/orderBy keys are validated against this pattern, which
    // is stricter than the manifest's field-id rule.
    for (const key of Object.keys(storageDataFromRecord({ pageId: 'p1' }))) {
      expect(key).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    }
  })

  it('clears a blanked field rather than omitting it', () => {
    const data = storageDataFromRecord({ pageId: 'p1', ogTitle: undefined })
    expect(data.ogTitle).toBe('')
  })
})

describe('recordFromStorageData', () => {
  it('round-trips a fully populated record', () => {
    const record: PageSeoRecord = {
      pageId: 'p1',
      slug: 'hello',
      metaDescription: 'Description',
      canonicalUrl: 'https://example.com/hello',
      ogTitle: 'Title',
      ogDescription: 'OG description',
      ogImage: '/hero.png',
      ogType: 'article',
      ogUrl: 'https://example.com/hello',
      twitterCard: 'summary_large_image',
      jsonLdType: 'Article',
      publishedAt: '2026-01-01',
      modifiedAt: '2026-02-01',
      author: 'Jane Doe',
      noindex: true,
    }
    expect(recordFromStorageData(storageDataFromRecord(record))).toEqual(record)
  })

  it('omits blank values instead of carrying empty strings through', () => {
    const record = recordFromStorageData(storageDataFromRecord({ pageId: 'p1' }))
    expect(record).toEqual({ pageId: 'p1', jsonLdType: 'none', noindex: false })
  })

  it('rejects an out-of-range structured-data type', () => {
    const record = recordFromStorageData({ pageId: 'p1', jsonLdType: 'Recipe' })
    expect(record.jsonLdType).toBeUndefined()
  })

  it('rejects an out-of-range twitter card', () => {
    const record = recordFromStorageData({ pageId: 'p1', twitterCard: 'player' })
    expect(record.twitterCard).toBeUndefined()
  })

  it('ignores values of the wrong type', () => {
    const record = recordFromStorageData({ pageId: 'p1', ogTitle: 42, noindex: 'yes' })
    expect(record.ogTitle).toBeUndefined()
    expect(record.noindex).toBeUndefined()
  })
})

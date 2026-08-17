/**
 * Mapping between the plugin's storage rows and `PageSeoRecord`.
 *
 * The host stores each record's payload as a loose
 * `Record<string, unknown>` and silently drops any key that is not
 * declared in the manifest's `resources[].fields`, so both directions are
 * written explicitly here rather than spreading arbitrary objects. That
 * keeps the manifest and the code in one obvious correspondence — if a
 * field is added to one, the compiler points at the other.
 */

import type { JsonLdType, PageSeoRecord, TwitterCardType } from './types'

/** Must match `resources[0].id` in `instatic-plugin.config.ts`. */
export const RESOURCE_ID = 'page-seo'

const JSON_LD_TYPES: readonly JsonLdType[] = ['none', 'Article', 'BlogPosting']
const TWITTER_CARDS: readonly TwitterCardType[] = ['summary', 'summary_large_image']

function readString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function readBoolean(data: Record<string, unknown>, key: string): boolean | undefined {
  const value = data[key]
  return typeof value === 'boolean' ? value : undefined
}

/**
 * Convert a stored row into a typed record.
 *
 * Enum-ish fields are validated against their allowed values rather than
 * cast, so a hand-edited row cannot inject an arbitrary string into
 * `og:type`-adjacent output.
 */
export function recordFromStorageData(data: Record<string, unknown>): PageSeoRecord {
  const jsonLdType = readString(data, 'jsonLdType')
  const twitterCard = readString(data, 'twitterCard')

  const record: PageSeoRecord = { pageId: readString(data, 'pageId') ?? '' }

  const slug = readString(data, 'slug')
  if (slug) record.slug = slug
  const metaDescription = readString(data, 'metaDescription')
  if (metaDescription) record.metaDescription = metaDescription
  const canonicalUrl = readString(data, 'canonicalUrl')
  if (canonicalUrl) record.canonicalUrl = canonicalUrl
  const ogTitle = readString(data, 'ogTitle')
  if (ogTitle) record.ogTitle = ogTitle
  const ogDescription = readString(data, 'ogDescription')
  if (ogDescription) record.ogDescription = ogDescription
  const ogImage = readString(data, 'ogImage')
  if (ogImage) record.ogImage = ogImage
  const ogType = readString(data, 'ogType')
  if (ogType) record.ogType = ogType
  const ogUrl = readString(data, 'ogUrl')
  if (ogUrl) record.ogUrl = ogUrl
  const publishedAt = readString(data, 'publishedAt')
  if (publishedAt) record.publishedAt = publishedAt
  const modifiedAt = readString(data, 'modifiedAt')
  if (modifiedAt) record.modifiedAt = modifiedAt
  const author = readString(data, 'author')
  if (author) record.author = author

  if (jsonLdType && JSON_LD_TYPES.includes(jsonLdType as JsonLdType)) {
    record.jsonLdType = jsonLdType as JsonLdType
  }
  if (twitterCard && TWITTER_CARDS.includes(twitterCard as TwitterCardType)) {
    record.twitterCard = twitterCard as TwitterCardType
  }
  const noindex = readBoolean(data, 'noindex')
  if (noindex !== undefined) record.noindex = noindex

  return record
}

/**
 * Convert a typed record into the storage payload.
 *
 * Every declared field is emitted, using `''` / `false` for cleared
 * values so an edit that blanks a field actually clears it. The host
 * treats empty string as "missing" and skips it, which is exactly the
 * desired behaviour for an optional field.
 */
export function storageDataFromRecord(record: PageSeoRecord): Record<string, unknown> {
  return {
    pageId: record.pageId,
    slug: record.slug ?? '',
    metaDescription: record.metaDescription ?? '',
    canonicalUrl: record.canonicalUrl ?? '',
    ogTitle: record.ogTitle ?? '',
    ogDescription: record.ogDescription ?? '',
    ogImage: record.ogImage ?? '',
    ogType: record.ogType ?? '',
    ogUrl: record.ogUrl ?? '',
    twitterCard: record.twitterCard ?? '',
    jsonLdType: record.jsonLdType ?? 'none',
    publishedAt: record.publishedAt ?? '',
    modifiedAt: record.modifiedAt ?? '',
    author: record.author ?? '',
    noindex: record.noindex === true,
  }
}

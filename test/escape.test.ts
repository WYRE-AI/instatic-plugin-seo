import { describe, expect, it } from 'bun:test'
import {
  escapeHtmlAttribute,
  normaliseText,
  serialiseJsonLd,
  truncate,
} from '../src/escape'

describe('escapeHtmlAttribute', () => {
  it('escapes the five characters that can break an attribute', () => {
    expect(escapeHtmlAttribute(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('escapes ampersands first so entities are not double-encoded', () => {
    expect(escapeHtmlAttribute('Tom & "Jerry"')).toBe('Tom &amp; &quot;Jerry&quot;')
  })

  it('neutralises an attribute-breakout attempt in a title', () => {
    const hostile = '" onload="alert(1)'
    const rendered = `<meta content="${escapeHtmlAttribute(hostile)}">`
    expect(rendered).toBe('<meta content="&quot; onload=&quot;alert(1)">')
    expect(rendered).not.toContain('" onload="')
  })

  it('leaves already-safe text untouched', () => {
    expect(escapeHtmlAttribute('A normal page title')).toBe('A normal page title')
  })
})

describe('serialiseJsonLd', () => {
  it('makes a </script> breakout unrepresentable', () => {
    const output = serialiseJsonLd({ headline: 'Bye</script><script>alert(1)</script>' })
    expect(output).not.toContain('</script>')
    expect(output).toContain('\\u003c')
  })

  it('escapes HTML comment openers', () => {
    expect(serialiseJsonLd({ a: '<!--' })).not.toContain('<!--')
  })

  it('round-trips to the original value through JSON.parse', () => {
    const value = { headline: 'Angle < brackets > & "quotes"' }
    expect(JSON.parse(serialiseJsonLd(value))).toEqual(value)
  })
})

describe('normaliseText', () => {
  it('collapses newlines and repeated spaces', () => {
    expect(normaliseText('  a\n\n  b\tc  ')).toBe('a b c')
  })
})

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('short', 160)).toBe('short')
  })

  it('cuts on a word boundary and marks the elision', () => {
    const result = truncate('the quick brown fox jumps over the lazy dog', 20)
    expect(result.length).toBeLessThanOrEqual(20)
    expect(result.endsWith('…')).toBe(true)
    expect(result).not.toContain('jum…')
  })

  it('still truncates when there is no usable word boundary', () => {
    const result = truncate('a'.repeat(80), 20)
    expect(result.length).toBeLessThanOrEqual(20)
  })
})

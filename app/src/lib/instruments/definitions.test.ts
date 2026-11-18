import { describe, expect, it } from 'vitest'
import { createInstrument, createWamInstrument, isApprovedPlugin, sameEngine, sameState, WAM_PLUGINS } from './definitions'

describe('sameState', () => {
  it('treats numbers that differ only by float rounding as equal', () => {
    expect(sameState({ a: 0.2 }, { a: 0.20000000298023224 })).toBe(true)
    expect(sameState({ a: 0.2 }, { a: 0.21 })).toBe(false)
  })

  it('compares nested objects and arrays, and notices missing keys', () => {
    expect(sameState({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] })).toBe(true)
    expect(sameState({ a: [1, 2] }, { a: [1, 2, 3] })).toBe(false)
    expect(sameState({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(sameState([1], { 0: 1 })).toBe(false)
  })

  it('compares other values exactly', () => {
    expect(sameState(null, null)).toBe(true)
    expect(sameState(null, {})).toBe(false)
    expect(sameState('saw', 'saw')).toBe(true)
  })
})

describe('sameEngine', () => {
  const plugin = createWamInstrument(WAM_PLUGINS[0])

  it('keeps the engine for new settings of the same synth or plugin', () => {
    expect(sameEngine(createInstrument('fm'), { ...createInstrument('fm'), depth: 9 })).toBe(true)
    expect(sameEngine(plugin, { ...plugin, state: { x: 1 } })).toBe(true)
  })

  it('needs a new engine for another synth type or another plugin', () => {
    expect(sameEngine(createInstrument('basic'), createInstrument('fm'))).toBe(false)
    expect(sameEngine(plugin, { ...plugin, url: 'https://example.com/other.js' })).toBe(false)
    expect(sameEngine(plugin, createInstrument('basic'))).toBe(false)
  })
})

it('only approves plugins on the list', () => {
  expect(isApprovedPlugin(WAM_PLUGINS[0].url)).toBe(true)
  expect(isApprovedPlugin('https://example.com/evil.js')).toBe(false)
})

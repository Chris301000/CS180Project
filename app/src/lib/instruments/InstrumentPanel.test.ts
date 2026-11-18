import { fireEvent, render } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InstrumentPanel from './InstrumentPanel.svelte'
import Knob from '../ui/Knob.svelte'
import { createInstrument, type Instrument } from './definitions'

const pointer = (el: Element, type: string, y: number, options: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientY: y, ...options }))

beforeEach(() => {
  Element.prototype.setPointerCapture = vi.fn()
})

describe('Knob', () => {
  function setup(curve: 'linear' | 'squared' = 'linear') {
    const onInput = vi.fn<(v: number) => void>()
    const onChange = vi.fn<(v: number) => void>()
    const { getByRole } = render(Knob, { label: 'Depth', value: 0, min: 0, max: 10, defaultValue: 3, curve, onInput, onChange })
    return { knob: getByRole('slider'), onInput, onChange }
  }

  it('follows a drag live, and records one change on release', () => {
    const { knob, onInput, onChange } = setup()
    pointer(knob, 'pointerdown', 200)
    pointer(knob, 'pointermove', 160) // 40px up of a 160px range: a quarter turn.
    pointer(knob, 'pointermove', 120)
    expect(onInput).toHaveBeenLastCalledWith(5)
    expect(onChange).not.toHaveBeenCalled()
    pointer(knob, 'pointerup', 120)
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(5)
  })

  it('makes no change for a click without turning', () => {
    const { knob, onChange } = setup()
    pointer(knob, 'pointerdown', 200)
    pointer(knob, 'pointerup', 200)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('stops at the ends of its range', () => {
    const { knob, onInput } = setup()
    pointer(knob, 'pointerdown', 200)
    pointer(knob, 'pointermove', -5000)
    expect(onInput).toHaveBeenLastCalledWith(10)
  })

  it('gives finer control near the minimum on a squared curve', () => {
    const { knob, onInput } = setup('squared')
    pointer(knob, 'pointerdown', 200)
    pointer(knob, 'pointermove', 120) // Halfway round is a quarter of the range.
    expect(onInput).toHaveBeenLastCalledWith(2.5)
  })

  it('turns with the arrow keys and resets on double-click', async () => {
    const { knob, onChange } = setup()
    await fireEvent.keyDown(knob, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith(0.5)
    await fireEvent.dblClick(knob)
    expect(onChange).toHaveBeenLastCalledWith(3)
  })
})

describe('InstrumentPanel', () => {
  function setup(instrument: Instrument = createInstrument('basic')) {
    const onInput = vi.fn<(next: Instrument) => void>()
    const onChange = vi.fn<(next: Instrument) => void>()
    const onVolumeInput = vi.fn<(volume: number) => void>()
    const onVolumeChange = vi.fn<(volume: number) => void>()
    const result = render(InstrumentPanel, { instrument, volume: 0.8, onInput, onChange, onVolumeInput, onVolumeChange })
    const volume = () => result.container.querySelector<HTMLInputElement>('.volume input')!
    return { ...result, onInput, onChange, onVolumeInput, onVolumeChange, volume }
  }

  it("shows the simple synth's controls", () => {
    const { getByLabelText, getByRole } = setup()
    expect(getByRole('combobox')).toHaveProperty('value', 'basic')
    expect(getByLabelText('Attack')).toBeTruthy()
    expect(getByLabelText('sawtooth').getAttribute('aria-checked')).toBe('true')
  })

  it('changes the wave', async () => {
    const { getByLabelText, onChange } = setup()
    await fireEvent.click(getByLabelText('square'))
    expect(onChange).toHaveBeenCalledWith({ ...createInstrument('basic'), wave: 'square' })
  })

  it('swaps in a new synth with its default settings', async () => {
    const { getByRole, onChange } = setup()
    await fireEvent.change(getByRole('combobox'), { target: { value: 'fm' } })
    expect(onChange).toHaveBeenCalledWith(createInstrument('fm'))
  })

  it("shows the FM synth's own controls", () => {
    const { getByLabelText, queryByLabelText } = setup(createInstrument('fm'))
    expect(getByLabelText('Ratio')).toBeTruthy()
    expect(getByLabelText('Depth')).toBeTruthy()
    expect(queryByLabelText('square')).toBeNull()
  })

  it('shows the volume, and reports it live while moving and once when let go', async () => {
    const { volume, getByText, onVolumeInput, onVolumeChange } = setup()
    expect(volume().value).toBe('0.8')
    expect(getByText('80%')).toBeTruthy()
    await fireEvent.input(volume(), { target: { value: '0.5' } })
    expect(onVolumeInput).toHaveBeenLastCalledWith(0.5)
    expect(onVolumeChange).not.toHaveBeenCalled()
    await fireEvent.change(volume(), { target: { value: '0.5' } })
    expect(onVolumeChange).toHaveBeenCalledWith(0.5)
  })

  it('passes live knob turns through without recording them', () => {
    const { getByLabelText, onInput, onChange } = setup(createInstrument('fm'))
    const depth = getByLabelText('Depth')
    pointer(depth, 'pointerdown', 200)
    pointer(depth, 'pointermove', 184)
    expect(onInput).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'fm', depth: 4 }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

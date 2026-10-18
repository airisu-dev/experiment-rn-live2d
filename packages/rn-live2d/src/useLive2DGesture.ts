import { useLayoutEffect, useMemo, useRef } from 'react'
import { Gesture } from 'react-native-gesture-handler'
import type { Live2DModel } from './loadModel'

/** A model on the canvas, placed like its `<Live2D>`. */
export interface Live2DGestureTarget {
  model: Live2DModel | null
  /** Same as the `<Live2D>` props. */
  x?: number
  y?: number
  scale?: number
  /**
   * Called with the hit areas under a tap, e.g. `['Head']`. Return true to skip
   * the default reaction: play a random motion of group `Tap<area>` (e.g.
   * `TapBody`), or for `Head` without one, a random expression.
   */
  onHit?: (hitAreas: string[]) => boolean | void
  /**
   * Makes the model draggable: long-press one of its hit areas, then move the
   * finger. Called with the model's new top-left position (its `x`, `y`) as
   * the finger moves; the app moves it.
   */
  onMove?: (x: number, y: number) => void
}

export interface Live2DGesturesOptions {
  /** Models follow the finger while it's down. Default true. */
  focus?: boolean
}

export interface Live2DGestureOptions
  extends Omit<Live2DGestureTarget, 'model'>,
    Live2DGesturesOptions {}

function react(model: Live2DModel, hitAreas: string[]) {
  for (const area of hitAreas) {
    const group = `Tap${area}`
    if (model.motionGroups.includes(group)) {
      model.motion(group)
      return
    }
    if (area === 'Head' && model.expressionNames.length > 0) {
      model.expression()
      return
    }
  }
}

// How long a press must last to pick up a draggable model.
const LONG_PRESS_MS = 350

// Canvas point to the target's model pixels.
function toModel({ x = 0, y = 0, scale = 1 }: Live2DGestureTarget, px: number, py: number) {
  return [(px - x) / scale, (py - y) / scale] as const
}

// The topmost target with a hit area under a canvas point, and its hit areas.
function topmostHit(targets: Live2DGestureTarget[], px: number, py: number) {
  // Later targets are drawn over earlier ones.
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i]!
    if (!t.model) continue
    const hitAreas = t.model.hitTest(...toModel(t, px, py))
    if (hitAreas.length > 0) return { target: t, hitAreas }
  }
  return null
}

/**
 * Touch interaction for several `<Live2D>` models in one canvas: put it on a
 * `<GestureDetector>` wrapping the `<Canvas>`. List targets in drawing order.
 * Every model looks at the finger, a tap goes to the topmost model with a hit
 * area under it, and a long press picks up that model if it has `onMove`.
 */
export function useLive2DGestures(
  targets: Live2DGestureTarget[],
  { focus = true }: Live2DGesturesOptions = {}
) {
  // Out of the React Compiler: the gesture callbacks are event handlers that
  // share refs, and it did miscompile them (a `let` shared between callbacks).
  'use no memo'

  // Read at event time, so the gesture is built once and targets can change freely.
  // Updated after render, not during it.
  const latest = useRef(targets)
  useLayoutEffect(() => {
    latest.current = targets
  })

  // The callbacks below only run on touch events, after render. The refs rule
  // can't tell that through RNGH's builder API (`.onStart(cb)` looks like a call
  // that may run `cb` during render), so it's off for this block only.
  /* eslint-disable react-hooks/refs */
  return useMemo(() => {
    const focusAll = (px: number, py: number) => {
      for (const t of latest.current) t.model?.focus(...toModel(t, px, py))
    }

    // onBegin fires on touch down, before the pan activates.
    const pan = Gesture.Pan()
      .runOnJS(true)
      .enabled(focus)
      .onBegin((e) => focusAll(e.x, e.y))
      .onUpdate((e) => focusAll(e.x, e.y))
      .onFinalize(() => {
        for (const t of latest.current) t.model?.resetFocus()
      })

    // Shorter than a long press, so picking a model up isn't also a tap.
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDuration(LONG_PRESS_MS - 50)
      .onEnd((e, success) => {
        if (!success) return
        const hit = topmostHit(latest.current, e.x, e.y)
        if (hit && hit.target.onHit?.(hit.hitAreas) !== true) {
          react(hit.target.model!, hit.hitAreas)
        }
      })

    // The model being dragged (found again by model, as targets can change),
    // and where the finger holds it relative to its top-left corner. Kept on an
    // object, which stays correct even if this hook is compiled again.
    const drag: {
      current: { model: Live2DModel; dx: number; dy: number } | null
    } = { current: null }
    const dragPan = Gesture.Pan()
      .runOnJS(true)
      .activateAfterLongPress(LONG_PRESS_MS)
      // Starts once the press has been held; the finger is still about where it went down.
      .onStart((e) => {
        const hit = topmostHit(latest.current, e.x, e.y)
        if (!hit?.target.onMove) return
        const { model, x = 0, y = 0 } = hit.target
        drag.current = { model: model!, dx: e.x - x, dy: e.y - y }
      })
      .onUpdate((e) => {
        if (!drag.current) return
        const { model, dx, dy } = drag.current
        latest.current.find((t) => t.model === model)?.onMove?.(e.x - dx, e.y - dy)
      })
      .onFinalize(() => {
        drag.current = null
      })

    return Gesture.Simultaneous(pan, tap, dragPan)
  }, [focus])
  /* eslint-enable react-hooks/refs */
}

/**
 * Touch interaction for one `<Live2D>` model: put it on a `<GestureDetector>`
 * wrapping the `<Canvas>`. The model looks at the finger, and tapping a hit
 * area plays a motion. For several models in one canvas, use `useLive2DGestures`.
 */
export function useLive2DGesture(
  model: Live2DModel | null,
  { focus, ...target }: Live2DGestureOptions = {}
) {
  return useLive2DGestures([{ model, ...target }], { focus })
}

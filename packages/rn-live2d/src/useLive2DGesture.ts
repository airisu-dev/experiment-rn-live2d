import { useMemo, useRef } from 'react'
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

// Canvas point to the target's model pixels.
function toModel({ x = 0, y = 0, scale = 1 }: Live2DGestureTarget, px: number, py: number) {
  return [(px - x) / scale, (py - y) / scale] as const
}

/**
 * Touch interaction for several `<Live2D>` models in one canvas: put it on a
 * `<GestureDetector>` wrapping the `<Canvas>`. List targets in drawing order.
 * Every model looks at the finger, and a tap goes to the topmost model with a
 * hit area under it.
 */
export function useLive2DGestures(
  targets: Live2DGestureTarget[],
  { focus = true }: Live2DGesturesOptions = {}
) {
  // Read at event time, so the gesture is built once and targets can change freely.
  const latest = useRef(targets)
  latest.current = targets

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

    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e, success) => {
        if (!success) return
        // Topmost first: later targets are drawn over earlier ones.
        for (const t of [...latest.current].reverse()) {
          if (!t.model) continue
          const hitAreas = t.model.hitTest(...toModel(t, e.x, e.y))
          if (hitAreas.length === 0) continue
          if (t.onHit?.(hitAreas) !== true) react(t.model, hitAreas)
          return
        }
      })

    return Gesture.Simultaneous(pan, tap)
  }, [focus])
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

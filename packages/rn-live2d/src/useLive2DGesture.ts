import { useMemo } from 'react'
import { Gesture } from 'react-native-gesture-handler'
import type { Live2DModel } from './loadModel'

export interface Live2DGestureOptions {
  /** The `<Live2D>` placement on the canvas: same as its props. */
  x?: number
  y?: number
  scale?: number
  /** The model follows the finger while it's down. Default true. */
  focus?: boolean
  /**
   * Called with the hit areas under a tap, e.g. `['Head']`. Return true to skip
   * the default reaction: play a random motion of group `Tap<area>` (e.g.
   * `TapBody`), or for `Head` without one, a random expression.
   */
  onHit?: (hitAreas: string[]) => boolean | void
}

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

/**
 * Touch interaction for a `<Live2D>` model: put it on a `<GestureDetector>`
 * wrapping the `<Canvas>`. The model looks at the finger, and tapping a hit
 * area plays a motion.
 */
export function useLive2DGesture(
  model: Live2DModel | null,
  { x = 0, y = 0, scale = 1, focus = true, onHit }: Live2DGestureOptions = {}
) {
  return useMemo(() => {
    // Canvas points to model pixels.
    const toModel = (px: number, py: number) =>
      [(px - x) / scale, (py - y) / scale] as const

    // onBegin fires on touch down, before the pan activates.
    const pan = Gesture.Pan()
      .runOnJS(true)
      .enabled(model !== null && focus)
      .onBegin((e) => model?.focus(...toModel(e.x, e.y)))
      .onUpdate((e) => model?.focus(...toModel(e.x, e.y)))
      .onFinalize(() => model?.resetFocus())

    const tap = Gesture.Tap()
      .runOnJS(true)
      .enabled(model !== null)
      .onEnd((e, success) => {
        if (!model || !success) return
        const hitAreas = model.hitTest(...toModel(e.x, e.y))
        if (hitAreas.length === 0) return
        if (onHit?.(hitAreas) !== true) react(model, hitAreas)
      })

    return Gesture.Simultaneous(pan, tap)
  }, [model, x, y, scale, focus, onHit])
}

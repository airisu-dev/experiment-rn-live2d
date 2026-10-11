import type { HybridObject } from 'react-native-nitro-modules'

export interface DrawableData {
  /** Index into the model's drawables; `masks` refers to these. */
  index: number
  /** Cubism's visibility flag. Hidden drawables can still be used as masks. */
  visible: boolean
  textureIndex: number
  opacity: number
  /** Cubism constant flags (`csmBlendAdditive`, `csmIsInvertedMask`, ...). */
  constantFlags: number
  /** Indices of the drawables that clip this one. Empty if unmasked. */
  masks: number[]
  /** float32 x/y pairs in model units, y-up. */
  positions: ArrayBuffer
  /** float32 u/v pairs in 0..1, v-up. */
  uvs: ArrayBuffer
  /** uint16 triangle indices. */
  indices: ArrayBuffer
}

/** Like the Cubism SDK samples: a higher priority interrupts a lower one. */
export type MotionPriority = 'idle' | 'normal' | 'force'

/**
 * Thread-safe: the model can be updated on one thread while another starts
 * motions or moves the focus.
 */
export interface Live2DModel
  extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  readonly canvasWidth: number
  readonly canvasHeight: number
  readonly originX: number
  readonly originY: number
  readonly pixelsPerUnit: number
  readonly drawableCount: number
  /** All drawables sorted by render order (back to front), including hidden ones. */
  getDrawables(): DrawableData[]
  /** Loads a `physics3.json`. */
  loadPhysics(json: string): void
  /** Loads a `pose3.json`. */
  loadPose(json: string): void
  /**
   * Loads one `motion3.json` as entry `index` of motion `group`.
   * Fade times come from `model3.json` when it defines them.
   */
  loadMotion(group: string, index: number, json: string): void
  /**
   * Starts a loaded motion, or a random one of `group` without `index`.
   * Returns false if it isn't loaded or a higher priority motion is playing.
   */
  startMotion(group: string, index?: number, priority?: MotionPriority): boolean
  /** Loads an `exp3.json` as expression `name`. */
  loadExpression(name: string, json: string): void
  /**
   * Fades to a loaded expression, or a random one without `name`.
   * Returns false if it isn't loaded.
   */
  setExpression(name?: string): boolean
  /** Removes the current expression at once. */
  clearExpression(): void
  /**
   * Holds a parameter at `value` until `clearParameter`. Applied after motions,
   * expressions, eye blink, look and breath, before physics and pose.
   */
  setParameter(id: string, value: number): void
  clearParameter(id: string): void
  /**
   * Makes the model look at a point, easing towards it: -1..1 on each axis,
   * y-up, (0, 0) is straight ahead.
   */
  focus(x: number, y: number): void
  /**
   * Names of the `model3.json` hit areas containing a point in model units
   * (y-up, see `originX`/`pixelsPerUnit`), in the order they're listed.
   */
  hitTest(x: number, y: number): string[]
  /**
   * Advances the model by `deltaSeconds`: motions (a random `Idle` motion
   * whenever nothing plays), expression, eye blink, look, breath, held
   * parameters, physics and pose.
   * Pass 0 to just apply the current state.
   */
  update(deltaSeconds: number): void
}

export interface RnLive2d extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  /**
   * Loads a `.moc3` file with its `model3.json` (used for eye blink and lip
   * sync parameters and motion fade times). Throws if the moc is invalid.
   */
  loadModel(moc: ArrayBuffer, settingsJson: string): Live2DModel
}

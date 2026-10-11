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
  /** Sets a part's opacity. Ignored if the id doesn't exist. Applied on `update()`. */
  setPartOpacity(id: string, opacity: number): void
  /** Sets a parameter's value. Ignored if the id doesn't exist. Applied on `update()`. */
  setParameterValue(id: string, value: number): void
  /** Recomputes drawables from the current parameters and part opacities. */
  update(): void
}

export interface RnLive2d extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  /** Loads a `.moc3` file. Throws if the moc is invalid or inconsistent. */
  loadModel(moc: ArrayBuffer): Live2DModel
}

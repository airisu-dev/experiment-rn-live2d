import type { HybridObject } from 'react-native-nitro-modules'

export interface DrawableData {
  textureIndex: number
  opacity: number
  /** Cubism constant flags (`csmBlendAdditive`, `csmBlendMultiplicative`, ...). */
  constantFlags: number
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
  /** Visible drawables sorted by render order (back to front). */
  getDrawables(): DrawableData[]
}

export interface RnLive2d extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  /** Loads a `.moc3` file. Throws if the moc is invalid or inconsistent. */
  loadModel(moc: ArrayBuffer): Live2DModel
}

// The Skia package rn-live2d draws with: react-native-skia (v3, Graphite) or
// @shopify/react-native-skia (v2, Ganesh), whichever the app installed. The
// parts used here are the same in both.
//
// Types are declared here, structurally, rather than imported: these sources
// are type-checked by the app, which may have only one of the two packages.
import type { ComponentType, ReactNode } from 'react'

export interface SkPoint {
  x: number
  y: number
}

export interface SkRect {
  x: number
  y: number
  width: number
  height: number
}

export interface SkShader {
  dispose(): void
}

export interface SkPicture {
  dispose(): void
}

export interface SkVertices {
  dispose(): void
}

export interface SkImage {
  width(): number
  height(): number
  makeShaderOptions(
    tx: number,
    ty: number,
    fm: number,
    mm: number
  ): SkShader
  dispose(): void
}

export interface SkPaint {
  setAntiAlias(antiAlias: boolean): void
  setAlphaf(alpha: number): void
  setBlendMode(blendMode: number): void
  setShader(shader: SkShader | null): void
}

export interface SkCanvas {
  saveLayer(paint?: SkPaint, bounds?: SkRect | null): number
  restore(): void
  drawVertices(vertices: SkVertices, mode: number, paint: SkPaint): void
}

interface SkPictureRecorder {
  beginRecording(bounds?: SkRect): SkCanvas
  finishRecordingAsPicture(): SkPicture
}

interface SkData {
  dispose(): void
}

interface SkiaApi {
  XYWHRect(x: number, y: number, width: number, height: number): SkRect
  Paint(): SkPaint
  PictureRecorder(): SkPictureRecorder
  MakeVertices(
    mode: number,
    positions: SkPoint[],
    textures?: SkPoint[] | null,
    colors?: undefined,
    indices?: number[] | null
  ): SkVertices
  Image: { MakeImageFromEncoded(data: SkData): SkImage | null }
  Data: { fromBytes(bytes: Uint8Array): SkData }
}

interface SkiaModule {
  Skia: SkiaApi
  BlendMode: {
    SrcOver: number
    Dst: number
    DstIn: number
    DstOut: number
    Plus: number
    Multiply: number
  }
  VertexMode: { Triangles: number }
  TileMode: { Clamp: number }
  FilterMode: { Linear: number }
  MipmapMode: { Linear: number }
  Group: ComponentType<{
    transform?: Record<string, number>[]
    children?: ReactNode
  }>
  // A picture or a shared value of one (Reanimated).
  Picture: ComponentType<{ picture: unknown }>
}

// Guarded requires: Metro (Expo enables optional dependencies) bundles the
// missing one as a require that throws. v3 first: in a monorepo both can be
// installed, and an app on v2 maps react-native-skia to it in its Metro config.
function loadSkia(): SkiaModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-skia') as SkiaModule
  } catch {}
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@shopify/react-native-skia') as SkiaModule
  } catch {}
  throw new Error(
    'rn-live2d needs react-native-skia (v3) or @shopify/react-native-skia (v2).'
  )
}

export const {
  Skia,
  BlendMode,
  VertexMode,
  TileMode,
  FilterMode,
  MipmapMode,
  Group,
  Picture,
} = loadSkia()

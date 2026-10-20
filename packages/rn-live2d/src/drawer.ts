// Records a model's drawables into Skia pictures. Everything here is a worklet,
// so it can run on the JS thread (model.draw) or a background worklet runtime (<Live2D>).
import {
  BlendMode,
  Skia,
  VertexMode,
  type SkCanvas,
  type SkImage,
  type SkPaint,
  type SkPicture,
  type SkPoint,
  type SkRect,
  type SkShader,
  type SkVertices,
} from './skia'
import { now } from './clock'
import type { DrawableData } from './specs/rn-live2d.nitro'

// Cubism constant flags (Live2DCubismCore.h).
const csmBlendAdditive = 1 << 0
const csmBlendMultiplicative = 1 << 1
const csmIsInvertedMask = 1 << 3

function blendModeOf(flags: number): number {
  'worklet'
  if (flags & csmBlendAdditive) return BlendMode.Plus
  if (flags & csmBlendMultiplicative) return BlendMode.Multiply
  return BlendMode.SrcOver
}


interface Mesh {
  vertices: SkVertices
  bounds: SkRect
  shader: SkShader
  /** The model-space positions this mesh was built from, to detect changes. */
  positions: Float32Array
}

/** Per-drawable data that never changes: texture coordinates and triangle indices. */
interface StaticMeshData {
  texCoords: SkPoint[]
  indices: number[]
}

function sameFloats(a: Float32Array, b: Float32Array): boolean {
  'worklet'
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Added to by a drawer when passed in, for frame stats. */
export interface DrawStats {
  /** Time spent building Skia vertices (`MakeVertices` and point arrays). */
  meshMs: number
  /** Meshes rebuilt because their vertices moved. */
  meshesBuilt: number
  /** `saveLayer`s for masks: two per masked drawable. */
  layers: number
}

export interface CanvasInfo {
  width: number
  height: number
  originX: number
  originY: number
  pixelsPerUnit: number
}

/**
 * Returns a function that records drawables into a picture. Paints are reused,
 * and a drawable's mesh is only rebuilt when its vertices moved since the last frame:
 * building Skia vertices is the most expensive part of a frame.
 */
export function createDrawer(
  textures: SkImage[],
  shaders: SkShader[],
  { width, height, originX, originY, pixelsPerUnit }: CanvasInfo
): (drawables: DrawableData[], stats?: DrawStats) => SkPicture {
  'worklet'
  const bounds = Skia.XYWHRect(0, 0, width, height)
  const paint = Skia.Paint()
  paint.setAntiAlias(true)
  const layerPaint = Skia.Paint()
  const staticData = new Map<number, StaticMeshData>()
  let lastMeshes = new Map<number, Mesh>()

  const staticDataOf = (d: DrawableData, texture: SkImage): StaticMeshData => {
    let data = staticData.get(d.index)
    if (!data) {
      const uv = new Float32Array(d.uvs)
      const texW = texture.width()
      const texH = texture.height()
      const texCoords: SkPoint[] = []
      for (let i = 0; i < uv.length; i += 2) {
        // Cubism UVs are v-up.
        texCoords.push({ x: uv[i]! * texW, y: (1 - uv[i + 1]!) * texH })
      }
      data = { texCoords, indices: Array.from(new Uint16Array(d.indices)) }
      staticData.set(d.index, data)
    }
    return data
  }

  return (drawables, stats) => {
    const byIndex = new Map(drawables.map((d) => [d.index, d]))

    // Masks reuse the same meshes many times, so look each one up once per frame.
    const meshes = new Map<number, Mesh | null>()
    const meshOf = (index: number): Mesh | null => {
      if (meshes.has(index)) return meshes.get(index)!
      const d = byIndex.get(index)
      const texture = d && textures[d.textureIndex]
      const shader = d && shaders[d.textureIndex]
      let mesh: Mesh | null = null
      if (d && texture && shader && d.indices.byteLength > 0) {
        const positions = new Float32Array(d.positions)
        const last = lastMeshes.get(index)
        if (last && sameFloats(last.positions, positions)) {
          mesh = last
        } else {
          const start = stats ? now() : 0
          const { texCoords, indices } = staticDataOf(d, texture)
          const points: SkPoint[] = []
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
          for (let i = 0; i < positions.length; i += 2) {
            // Cubism is y-up in model units; Skia is y-down in pixels.
            const x = originX + positions[i]! * pixelsPerUnit
            const y = originY - positions[i + 1]! * pixelsPerUnit
            points.push({ x, y })
            minX = Math.min(minX, x); maxX = Math.max(maxX, x)
            minY = Math.min(minY, y); maxY = Math.max(maxY, y)
          }
          mesh = {
            vertices: Skia.MakeVertices(
              VertexMode.Triangles,
              points,
              texCoords,
              undefined,
              indices
            ),
            bounds: Skia.XYWHRect(minX, minY, maxX - minX, maxY - minY),
            shader,
            positions,
          }
          if (stats) {
            stats.meshMs += now() - start
            stats.meshesBuilt++
          }
        }
      }
      meshes.set(index, mesh)
      return mesh
    }

    const drawMesh = (canvas: SkCanvas, mesh: Mesh, paint: SkPaint) => {
      paint.setShader(mesh.shader)
      // No per-vertex colors, so the vertex blend mode is unused; the shader alone colors the mesh.
      canvas.drawVertices(mesh.vertices, BlendMode.Dst, paint)
    }

    const recorder = Skia.PictureRecorder()
    const canvas = recorder.beginRecording(bounds)

    for (const d of drawables) {
      if (!d.visible || d.opacity <= 0) continue
      const mesh = meshOf(d.index)
      if (!mesh) continue

      if (d.masks.length === 0) {
        paint.setAlphaf(d.opacity)
        paint.setBlendMode(blendModeOf(d.constantFlags))
        drawMesh(canvas, mesh, paint)
        continue
      }

      // Draw into a layer, cut it with the union of the masks, then composite
      // the layer with the drawable's blend mode.
      if (stats) stats.layers += 2
      layerPaint.setBlendMode(blendModeOf(d.constantFlags))
      canvas.saveLayer(layerPaint, mesh.bounds)
      paint.setAlphaf(d.opacity)
      paint.setBlendMode(BlendMode.SrcOver)
      drawMesh(canvas, mesh, paint)

      layerPaint.setBlendMode(
        d.constantFlags & csmIsInvertedMask ? BlendMode.DstOut : BlendMode.DstIn
      )
      canvas.saveLayer(layerPaint, mesh.bounds)
      paint.setAlphaf(1)
      for (const maskIndex of d.masks) {
        const maskMesh = meshOf(maskIndex)
        if (maskMesh) drawMesh(canvas, maskMesh, paint)
      }
      canvas.restore()
      canvas.restore()
    }
    const picture = recorder.finishRecordingAsPicture()
    // Free the meshes that were replaced or not used this frame. Pictures hold
    // their own references, and the GC doesn't see this native memory.
    const nextMeshes = new Map<number, Mesh>()
    for (const [index, mesh] of meshes) if (mesh) nextMeshes.set(index, mesh)
    for (const [index, mesh] of lastMeshes) {
      if (nextMeshes.get(index) !== mesh) mesh.vertices.dispose()
    }
    lastMeshes = nextMeshes
    return picture
  }
}

/** Raw JSI methods a native model has when rn-live2d is built with Skia (cpp/SkiaDrawer.cpp). */
interface NativeDrawing {
  setTextures(shaders: SkShader[], sizes: number[]): void
  drawTo(canvas: SkCanvas, wantStats: boolean): DrawStats | undefined
}

function nativeDrawing(native: object): NativeDrawing | null {
  'worklet'
  const n = native as Partial<NativeDrawing>
  return typeof n.drawTo === 'function' && typeof n.setTextures === 'function'
    ? (n as NativeDrawing)
    : null
}

/** Hands the textures to the native drawer, if there is one. Call once per model. */
export function setNativeTextures(
  native: object,
  textures: SkImage[],
  shaders: SkShader[]
): void {
  const drawing = nativeDrawing(native)
  if (!drawing) return
  drawing.setTextures(
    shaders,
    textures.flatMap((t) => [t.width(), t.height()])
  )
}

/**
 * Like createDrawer, but drawn in C++ straight from the model, without
 * copying drawables to JS or building meshes through JSI. Null when rn-live2d
 * isn't built with Skia (then use createDrawer).
 */
export function createNativeDrawer(
  native: object,
  { width, height }: CanvasInfo
): ((stats?: DrawStats) => SkPicture) | null {
  'worklet'
  const drawing = nativeDrawing(native)
  if (!drawing) return null
  const bounds = Skia.XYWHRect(0, 0, width, height)
  return (stats) => {
    const recorder = Skia.PictureRecorder()
    const canvas = recorder.beginRecording(bounds)
    const s = drawing.drawTo(canvas, stats !== undefined)
    if (stats && s) {
      stats.meshMs += s.meshMs
      stats.meshesBuilt += s.meshesBuilt
      stats.layers += s.layers
    }
    return recorder.finishRecordingAsPicture()
  }
}

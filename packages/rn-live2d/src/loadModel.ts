import { Asset } from 'expo-asset'
import { File } from 'expo-file-system'
import {
  BlendMode,
  FilterMode,
  MipmapMode,
  Skia,
  TileMode,
  VertexMode,
  type SkCanvas,
  type SkImage,
  type SkPaint,
  type SkPicture,
  type SkPoint,
  type SkRect,
  type SkShader,
  type SkVertices,
} from 'react-native-skia'
import { toCubismJson } from './cubismJson'
import { RnLive2d } from './native'
import type {
  DrawableData,
  Live2DModel as NativeModel,
} from './specs/rn-live2d.nitro'

// Cubism constant flags (Live2DCubismCore.h).
const csmBlendAdditive = 1 << 0
const csmBlendMultiplicative = 1 << 1
const csmIsInvertedMask = 1 << 3

/** A `require()`d asset module or a URL. */
export type AssetSource = number | string

/** A parsed Cubism JSON file, e.g. `require('./model.physics3.json')`. */
export type CubismJson = object

export interface Live2DModelSource {
  /** Parsed `model3.json`: eye blink / lip sync parameters and motion fade times. */
  settings: CubismJson
  moc: AssetSource
  /** In the order listed in `model3.json` `FileReferences.Textures`. */
  textures: AssetSource[]
  physics?: CubismJson
  pose?: CubismJson
  /**
   * Motions by group, in the order listed in `model3.json`
   * `FileReferences.Motions`. A random `Idle` motion plays whenever nothing else does.
   */
  motions?: Record<string, CubismJson[]>
}

export interface Live2DModel {
  /** Native model: `update(dt)`, `startMotion(...)`. */
  native: NativeModel
  /** The model drawn at load, at its native canvas size, origin top-left. */
  picture: SkPicture
  width: number
  height: number
  /** Draws the model's current state (after `native.update`) into a new picture. */
  draw(): SkPicture
}

async function readAsset(source: AssetSource): Promise<ArrayBuffer> {
  const [asset] = await Asset.loadAsync(source)
  if (!asset?.localUri) {
    throw new Error(`Live2D: failed to download asset ${String(source)}`)
  }
  return new File(asset.localUri).arrayBuffer()
}

async function loadTexture(source: AssetSource): Promise<SkImage> {
  const bytes = new Uint8Array(await readAsset(source))
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes))
  if (!image) {
    throw new Error(`Live2D: failed to decode texture ${String(source)}`)
  }
  return image
}

function blendModeOf(flags: number): BlendMode {
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
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

interface CanvasInfo {
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
function createDrawer(
  textures: SkImage[],
  shaders: SkShader[],
  { width, height, originX, originY, pixelsPerUnit }: CanvasInfo
): (drawables: DrawableData[]) => SkPicture {
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

  return (drawables) => {
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

export async function loadLive2DModel(
  source: Live2DModelSource
): Promise<Live2DModel> {
  const [moc, textures] = await Promise.all([
    readAsset(source.moc),
    Promise.all(source.textures.map(loadTexture)),
  ])
  const native = RnLive2d.loadModel(moc, toCubismJson(source.settings))
  if (source.physics) native.loadPhysics(toCubismJson(source.physics))
  if (source.pose) native.loadPose(toCubismJson(source.pose))
  for (const [group, motions] of Object.entries(source.motions ?? {})) {
    motions.forEach((motion, i) =>
      native.loadMotion(group, i, toCubismJson(motion))
    )
  }
  // Apply the pose and the first idle motion's starting state.
  native.update(0)

  const shaders = textures.map((t) =>
    t.makeShaderOptions(
      TileMode.Clamp,
      TileMode.Clamp,
      FilterMode.Linear,
      MipmapMode.None
    )
  )
  const width = native.canvasWidth
  const height = native.canvasHeight
  const drawer = createDrawer(textures, shaders, {
    width,
    height,
    originX: native.originX,
    originY: native.originY,
    pixelsPerUnit: native.pixelsPerUnit,
  })
  const draw = () => drawer(native.getDrawables())
  return { native, picture: draw(), width, height, draw }
}

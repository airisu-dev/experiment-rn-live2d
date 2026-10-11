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

export interface Live2DModelSource {
  moc: AssetSource
  /** In the order listed in `model3.json` `FileReferences.Textures`. */
  textures: AssetSource[]
  /** Parsed `pose3.json`, e.g. `require('./model.pose3.json')`. */
  pose?: PoseJson
}

export interface PoseJson {
  Groups: { Id: string; Link?: string[] }[][]
}

export interface Live2DModel {
  /** The whole model drawn at its native canvas size, origin top-left. */
  picture: SkPicture
  width: number
  height: number
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

/**
 * Shows the first part of each pose group and hides the rest, like Cubism's
 * `CubismPose::Reset`. Linked parts follow their group's part.
 */
function applyPose(model: NativeModel, pose: PoseJson) {
  for (const group of pose.Groups) {
    group.forEach((part, i) => {
      const value = i === 0 ? 1 : 0
      model.setPartOpacity(part.Id, value)
      model.setParameterValue(part.Id, value)
      for (const link of part.Link ?? []) model.setPartOpacity(link, value)
    })
  }
  model.update()
}

interface Mesh {
  vertices: SkVertices
  bounds: SkRect
  shader: SkShader
}

function buildPicture(
  drawables: DrawableData[],
  textures: SkImage[],
  width: number,
  height: number,
  originX: number,
  originY: number,
  pixelsPerUnit: number
): SkPicture {
  const shaders = textures.map((t) =>
    t.makeShaderOptions(
      TileMode.Clamp,
      TileMode.Clamp,
      FilterMode.Linear,
      MipmapMode.None
    )
  )
  const byIndex = new Map(drawables.map((d) => [d.index, d]))

  // Masks reuse the same meshes many times, so build each one once.
  const meshes = new Map<number, Mesh | null>()
  const meshOf = (index: number): Mesh | null => {
    if (meshes.has(index)) return meshes.get(index)!
    const d = byIndex.get(index)
    const texture = d && textures[d.textureIndex]
    const shader = d && shaders[d.textureIndex]
    let mesh: Mesh | null = null
    if (d && texture && shader && d.indices.byteLength > 0) {
      const pos = new Float32Array(d.positions)
      const uv = new Float32Array(d.uvs)
      const texW = texture.width()
      const texH = texture.height()
      const points: SkPoint[] = []
      const texCoords: SkPoint[] = []
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (let i = 0; i < pos.length; i += 2) {
        // Cubism is y-up in model units; Skia is y-down in pixels.
        const x = originX + pos[i]! * pixelsPerUnit
        const y = originY - pos[i + 1]! * pixelsPerUnit
        points.push({ x, y })
        minX = Math.min(minX, x); maxX = Math.max(maxX, x)
        minY = Math.min(minY, y); maxY = Math.max(maxY, y)
        // Cubism UVs are v-up.
        texCoords.push({ x: uv[i]! * texW, y: (1 - uv[i + 1]!) * texH })
      }
      mesh = {
        vertices: Skia.MakeVertices(
          VertexMode.Triangles,
          points,
          texCoords,
          undefined,
          Array.from(new Uint16Array(d.indices))
        ),
        bounds: Skia.XYWHRect(minX, minY, maxX - minX, maxY - minY),
        shader,
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
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height))
  const paint = Skia.Paint()
  paint.setAntiAlias(true)
  const layerPaint = Skia.Paint()

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
  return recorder.finishRecordingAsPicture()
}

export async function loadLive2DModel(
  source: Live2DModelSource
): Promise<Live2DModel> {
  const [moc, textures] = await Promise.all([
    readAsset(source.moc),
    Promise.all(source.textures.map(loadTexture)),
  ])
  const model = RnLive2d.loadModel(moc)
  if (source.pose) applyPose(model, source.pose)
  const width = model.canvasWidth
  const height = model.canvasHeight
  const picture = buildPicture(
    model.getDrawables(),
    textures,
    width,
    height,
    model.originX,
    model.originY,
    model.pixelsPerUnit
  )
  return { picture, width, height }
}

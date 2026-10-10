import { Asset } from 'expo-asset'
import { File } from 'expo-file-system'
import {
  BlendMode,
  FilterMode,
  MipmapMode,
  Skia,
  TileMode,
  VertexMode,
  type SkImage,
  type SkPicture,
  type SkPoint,
} from 'react-native-skia'
import { RnLive2d } from './native'
import type { DrawableData } from './specs/rn-live2d.nitro'

// Cubism constant flags (Live2DCubismCore.h).
const csmBlendAdditive = 1 << 0
const csmBlendMultiplicative = 1 << 1

/** A `require()`d asset module or a URL. */
export type AssetSource = number | string

export interface Live2DModelSource {
  moc: AssetSource
  /** In the order listed in `model3.json` `FileReferences.Textures`. */
  textures: AssetSource[]
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
  const recorder = Skia.PictureRecorder()
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height))
  const paint = Skia.Paint()
  paint.setAntiAlias(true)

  for (const d of drawables) {
    const texture = textures[d.textureIndex]
    const shader = shaders[d.textureIndex]
    if (!texture || !shader) continue

    const pos = new Float32Array(d.positions)
    const uv = new Float32Array(d.uvs)
    const texW = texture.width()
    const texH = texture.height()
    const vertices: SkPoint[] = []
    const texCoords: SkPoint[] = []
    for (let i = 0; i < pos.length; i += 2) {
      // Cubism is y-up in model units; Skia is y-down in pixels.
      vertices.push({
        x: originX + pos[i]! * pixelsPerUnit,
        y: originY - pos[i + 1]! * pixelsPerUnit,
      })
      // Cubism UVs are v-up.
      texCoords.push({ x: uv[i]! * texW, y: (1 - uv[i + 1]!) * texH })
    }

    paint.setShader(shader)
    paint.setAlphaf(d.opacity)
    paint.setBlendMode(blendModeOf(d.constantFlags))
    const verts = Skia.MakeVertices(
      VertexMode.Triangles,
      vertices,
      texCoords,
      undefined,
      Array.from(new Uint16Array(d.indices))
    )
    // No per-vertex colors, so the vertex blend mode is unused; the shader alone colors the mesh.
    canvas.drawVertices(verts, BlendMode.Dst, paint)
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

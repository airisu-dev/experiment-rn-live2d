import { Asset } from 'expo-asset'
import { File } from 'expo-file-system'
import {
  FilterMode,
  MipmapMode,
  Skia,
  TileMode,
  type SkImage,
  type SkPicture,
  type SkShader,
} from 'react-native-skia'
import { toCubismJson } from './cubismJson'
import { createDrawer, type CanvasInfo } from './drawer'
import { RnLive2d } from './native'
import type { Live2DModel as NativeModel } from './specs/rn-live2d.nitro'

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
  /** For drawing on another worklet runtime with `createDrawer`. */
  textures: SkImage[]
  shaders: SkShader[]
  canvas: CanvasInfo
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
  const canvas: CanvasInfo = {
    width,
    height,
    originX: native.originX,
    originY: native.originY,
    pixelsPerUnit: native.pixelsPerUnit,
  }
  const drawer = createDrawer(textures, shaders, canvas)
  const draw = () => drawer(native.getDrawables())
  return { native, picture: draw(), width, height, draw, textures, shaders, canvas }
}

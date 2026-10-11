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
import {
  createDrawer,
  createNativeDrawer,
  setNativeTextures,
  type CanvasInfo,
} from './drawer'
import {
  isModelContext,
  sourceFromContext,
  type Live2DModelContext,
} from './modelContext'
import { RnLive2d } from './native'
import type {
  MotionPriority,
  Live2DModel as NativeModel,
} from './specs/rn-live2d.nitro'

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
  /** Expressions by name, as listed in `model3.json` `FileReferences.Expressions`. */
  expressions?: Record<string, CubismJson>
}

/**
 * A loaded model. Points are in model pixels: the model's canvas at its
 * native size (`width` x `height`), origin top-left, like `picture`.
 */
export interface Live2DModel {
  /**
   * Plays a motion of `group`, a random one without `index`. Returns false
   * if there's no such motion or one with a higher priority is playing.
   */
  motion(group: string, index?: number, priority?: MotionPriority): boolean
  /** Fades to an expression, a random one without `name`. Returns false if there's none. */
  expression(name?: string): boolean
  /** Removes the current expression. */
  resetExpression(): void
  /** Holds a parameter at `value`, over motions, until `resetParameter`. */
  setParameter(id: string, value: number): void
  resetParameter(id: string): void
  /** Turns the face, body and eyes towards a point, easing. */
  focus(x: number, y: number): void
  /** Looks straight ahead again. */
  resetFocus(): void
  /** Names of the `model3.json` hit areas at a point, e.g. `['Head', 'Body']`. */
  hitTest(x: number, y: number): string[]
  /** Loaded motion groups, e.g. `['Idle', 'TapBody']`. */
  motionGroups: string[]
  /** Loaded expression names. */
  expressionNames: string[]

  /** Unique per loaded model: <Live2D>s showing the same model share its frames. */
  id: number
  /** Native model. Thread-safe. */
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
  const asset = Asset.fromModule(source)
  // Android release builds embed images as drawables, and expo-asset marks them
  // downloaded with a bare resource name (enough for <Image>), which isn't a file.
  // Download for real: that copies the resource into the cache.
  if (asset.localUri && !asset.localUri.includes(':')) {
    asset.downloaded = false
    asset.localUri = null
  }
  await asset.downloadAsync()
  if (!asset.localUri) {
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

/** Loads a model from its files, or from a `require.context` of its folder. */
let nextModelId = 1

export async function loadLive2DModel(
  input: Live2DModelSource | Live2DModelContext
): Promise<Live2DModel> {
  const source = isModelContext(input) ? sourceFromContext(input) : input
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
  for (const [name, expression] of Object.entries(source.expressions ?? {})) {
    native.loadExpression(name, toCubismJson(expression))
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
  setNativeTextures(native, textures, shaders)
  const nativeDraw = createNativeDrawer(native, canvas)
  const drawer = createDrawer(textures, shaders, canvas)
  const draw = nativeDraw ?? (() => drawer(native.getDrawables()))
  // Model pixels (y-down) to model units (y-up).
  const toUnits = (x: number, y: number) =>
    [
      (x - canvas.originX) / canvas.pixelsPerUnit,
      (canvas.originY - y) / canvas.pixelsPerUnit,
    ] as const

  return {
    id: nextModelId++,
    motion: (group, index, priority) =>
      native.startMotion(group, index, priority),
    expression: (name) => native.setExpression(name),
    resetExpression: () => native.clearExpression(),
    setParameter: (id, value) => native.setParameter(id, value),
    resetParameter: (id) => native.clearParameter(id),
    // Relative to the canvas center, -1..1, y-up.
    focus: (x, y) => native.focus((x / width) * 2 - 1, 1 - (y / height) * 2),
    resetFocus: () => native.focus(0, 0),
    hitTest: (x, y) => native.hitTest(...toUnits(x, y)),
    motionGroups: Object.keys(source.motions ?? {}),
    expressionNames: Object.keys(source.expressions ?? {}),
    native,
    picture: draw(),
    width,
    height,
    draw,
    textures,
    shaders,
    canvas,
  }
}

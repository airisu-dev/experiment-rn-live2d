import type { CubismJson, Live2DModelSource } from './loadModel'

/**
 * A Metro `require.context` of a model's folder, e.g.
 * `require.context('./Mao', true, /\.(json|moc3|png)$/)`. The path must be a
 * string literal, so Metro can bundle the folder.
 */
export interface Live2DModelContext {
  keys(): string[]
  (id: string): unknown
}

export interface Model3Json {
  FileReferences?: {
    Moc?: string
    Textures?: string[]
    Physics?: string
    Pose?: string
    Motions?: Record<string, { File: string }[]>
    Expressions?: { Name: string; File: string }[]
  }
}

export function isModelContext(
  source: Live2DModelSource | Live2DModelContext
): source is Live2DModelContext {
  return typeof source === 'function'
}

/**
 * Resolves `file` relative to the folder of `from`: a context key
 * ('./a/b.json') or a URL ('https://host/a/b.json?v=1').
 */
export function resolvePath(from: string, file: string): string {
  const parts = from.replace(/[?#].*$/, '').split('/').slice(0, -1)
  for (const part of file.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.' && part !== '') parts.push(part)
  }
  return parts.join('/')
}

/** Reads the folder's `model3.json` and requires every file it lists. */
export function sourceFromContext(context: Live2DModelContext): Live2DModelSource {
  const keys = context.keys()
  const model3Keys = keys.filter((k) => k.endsWith('.model3.json'))
  if (model3Keys.length !== 1) {
    throw new Error(
      `Live2D: expected one .model3.json in the require.context, found ${
        model3Keys.length === 0 ? 'none' : model3Keys.join(', ')
      }`
    )
  }
  const model3Key = model3Keys[0]!
  const settings = context(model3Key) as Model3Json
  const refs = settings.FileReferences ?? {}

  const load = <T>(file: string): T => {
    const key = resolvePath(model3Key, file)
    if (!keys.includes(key)) {
      throw new Error(
        `Live2D: ${file} (listed in ${model3Key}) isn't in the require.context. Check its filter.`
      )
    }
    return context(key) as T
  }

  if (!refs.Moc) throw new Error(`Live2D: ${model3Key} has no FileReferences.Moc`)
  return {
    settings: settings as CubismJson,
    moc: load(refs.Moc),
    textures: (refs.Textures ?? []).map((t) => load(t)),
    physics: refs.Physics ? load(refs.Physics) : undefined,
    pose: refs.Pose ? load(refs.Pose) : undefined,
    motions: Object.fromEntries(
      Object.entries(refs.Motions ?? {}).map(([group, motions]) => [
        group,
        motions.map((m) => load<CubismJson>(m.File)),
      ])
    ),
    expressions: Object.fromEntries(
      (refs.Expressions ?? []).map((e) => [e.Name, load<CubismJson>(e.File)])
    ),
  }
}

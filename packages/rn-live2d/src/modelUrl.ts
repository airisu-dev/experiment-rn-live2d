import { fetch } from 'expo/fetch'
import type { CubismJson, Live2DModelSource } from './loadModel'
import { resolvePath, type Model3Json } from './modelContext'

/** How remote model files are requested. */
export interface Live2DLoadOptions {
  /** Sent with every request for a remote file, e.g. `{ Authorization: 'Bearer …' }`. */
  headers?: Record<string, string>
  /**
   * Gives the URL to request for a file the `model3.json` lists, e.g. to sign
   * each one through your backend. `url` is resolved next to the `model3.json`,
   * without a query; `file` is the path as listed. Replaces the default, which
   * reuses the `model3.json` URL's query (e.g. a token) for files on its host.
   */
  resolveUrl?: (url: string, file: string) => string | Promise<string>
}

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:\/\//i

export function isRemote(source: unknown): source is string {
  return typeof source === 'string' && /^https?:\/\//i.test(source)
}

/** A URL without its query and hash, which can hold tokens: for error messages. */
export function redactUrl(url: string): string {
  return url.replace(/[?#].*$/, '')
}

const origin = (url: string) => /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i.exec(url)?.[0]
const queryOf = (url: string) => /\?[^#]*/.exec(url)?.[0] ?? ''

async function request(url: string, options: Live2DLoadOptions) {
  let res
  try {
    res = await fetch(url, { headers: options.headers })
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    throw new Error(`Live2D: failed to fetch ${redactUrl(url)} (${reason})`)
  }
  if (!res.ok) {
    throw new Error(`Live2D: failed to fetch ${redactUrl(url)} (${res.status})`)
  }
  return res
}

export async function fetchBytes(
  url: string,
  options: Live2DLoadOptions
): Promise<ArrayBuffer> {
  return (await request(url, options)).arrayBuffer()
}

async function fetchJson<T>(url: string, options: Live2DLoadOptions): Promise<T> {
  return (await (await request(url, options)).json()) as T
}

// Escapes a model3.json file path for a URL: names can have spaces. Already
// escaped segments are decoded first, so they aren't escaped twice.
function encodePath(file: string): string {
  return file
    .split('/')
    .map((part) => {
      if (part === '.' || part === '..') return part
      try {
        return encodeURIComponent(decodeURIComponent(part))
      } catch {
        return encodeURIComponent(part)
      }
    })
    .join('/')
}

/**
 * Fetches a `model3.json` and the JSON files it lists. The moc and textures
 * stay URLs, downloaded later with the same options.
 */
export async function sourceFromUrl(
  url: string,
  options: Live2DLoadOptions = {}
): Promise<Live2DModelSource> {
  const settings = await fetchJson<Model3Json>(url, options)
  const refs = settings.FileReferences ?? {}
  if (!refs.Moc) {
    throw new Error(`Live2D: ${redactUrl(url)} has no FileReferences.Moc`)
  }

  const query = queryOf(url)
  const resolve = async (file: string): Promise<string> => {
    const plain = ABSOLUTE.test(file) ? file : resolvePath(url, encodePath(file))
    if (options.resolveUrl) return options.resolveUrl(plain, file)
    // The model3.json's query (e.g. a signing token) goes to its own host only.
    if (!query || origin(plain) !== origin(url)) return plain
    return plain.includes('?') ? `${plain}&${query.slice(1)}` : plain + query
  }
  const json = async (file: string) => fetchJson<CubismJson>(await resolve(file), options)

  const motionGroups = Object.entries(refs.Motions ?? {})
  const [moc, textures, physics, pose, motions, expressions] = await Promise.all([
    resolve(refs.Moc),
    Promise.all((refs.Textures ?? []).map(resolve)),
    refs.Physics ? json(refs.Physics) : undefined,
    refs.Pose ? json(refs.Pose) : undefined,
    Promise.all(motionGroups.map(([, list]) => Promise.all(list.map((m) => json(m.File))))),
    Promise.all((refs.Expressions ?? []).map((e) => json(e.File))),
  ])

  return {
    settings: settings as CubismJson,
    moc,
    textures,
    physics,
    pose,
    motions: Object.fromEntries(motionGroups.map(([group], i) => [group, motions[i]!])),
    expressions: Object.fromEntries(
      (refs.Expressions ?? []).map((e, i) => [e.Name, expressions[i]!])
    ),
  }
}

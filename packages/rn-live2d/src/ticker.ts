// One animation loop for every <Live2D> on the live2d worklet runtime: each
// frame, every shown model is updated and drawn once, in one pass. Everything
// here runs on that runtime, and its state lives in the runtime's globalThis.
import {
  scheduleOnRN,
  type Synchronizable,
} from 'react-native-worklets'
import type { SkImage, SkPicture, SkShader } from './skia'
import { now } from './clock'
import {
  createDrawer,
  createNativeDrawer,
  type CanvasInfo,
  type DrawStats,
} from './drawer'
import type { Live2DModel as NativeModel } from './specs/rn-live2d.nitro'

/** Averages per frame over the last second, in milliseconds unless noted. */
export interface Live2DFrameStats {
  /** Frames drawn per second. */
  fps: number
  /** The frame rate the loop aims for: the display's refresh rate, or `maxFps`. */
  targetFps: number
  /** All work for this model's frame on the animation thread. */
  workMs: number
  /** Motions, physics and so on in C++ (`update`). */
  updateMs: number
  /** Copying vertex data out of C++ (`getDrawables`). 0 when drawn in C++. */
  drawablesMs: number
  /** Recording the picture, including `meshMs`. */
  drawMs: number
  /** Building Skia vertices for drawables that moved. */
  meshMs: number
  /** Meshes rebuilt per frame (a count). */
  meshesBuilt: number
  /**
   * Mask layers per frame (a count). Their cost is in the UI thread's Skia
   * draw, which these stats don't cover.
   */
  layers: number
  /** Models animated by the loop, this one included (a count). */
  models: number
  /** All work for a frame of the loop, every model included. */
  loopWorkMs: number
}

/** A newly drawn frame, for the UI thread to pick up. */
export type PublishedFrame = { frame: number; picture: SkPicture } | null

/** One <Live2D> showing a model. */
export interface TickerView {
  /** Receives each new frame. */
  target: Synchronizable<PublishedFrame>
  /**
   * The frame the UI thread shows, set when it takes one from `target`; -1
   * before the first. Frames are freed only once every view is past them.
   */
  shown: Synchronizable<number>
  /** Set to false to stop showing frames here. */
  running: Synchronizable<boolean>
  /** The display's frame interval, measured on the UI thread; 0 until known. */
  displayMs: Synchronizable<number>
  /** Shortest frame time for this view (`maxFps`); 0 for no cap. */
  capMs: number
  /** Gets frame stats about once a second; null if not wanted. */
  report: ((stats: Live2DFrameStats) => void) | null
}

/** What a <Live2D> needs to register its model. */
export interface TickerModel {
  id: number
  native: NativeModel
  textures: SkImage[]
  shaders: SkShader[]
  canvas: CanvasInfo
}

// Longest step per frame, so returning from the background doesn't jump motions and physics.
const MAX_DELTA_SECONDS = 0.1
// How far drawing may run ahead of the slowest view's UI thread. Beyond it the
// model waits, e.g. while the app is in the background and the UI thread doesn't draw.
const MAX_FRAMES_AHEAD = 4
// Frame time until the display's refresh rate is known, and its limits.
const DEFAULT_FRAME_MS = 1000 / 60
const MIN_FRAME_MS = 1000 / 144
const MAX_FRAME_MS = 1000 / 30
const STATS_INTERVAL_MS = 1000
// A capped model draws on the first tick at least this close to its interval.
const CAP_TOLERANCE_MS = 1

interface Slot {
  view: TickerView
  /** The entry's newest frame when the view joined: the oldest it can show before acking one. */
  since: number
}

interface Frame {
  frame: number
  picture: SkPicture
}

interface Entry {
  native: NativeModel
  /** Draws the model's current state: in C++ when built with Skia, else in JS. */
  nativeDraw: ((stats?: DrawStats) => SkPicture) | null
  jsDraw: ReturnType<typeof createDrawer> | null
  views: Slot[]
  /**
   * Frames a view may still show, oldest first. Freed explicitly once no view
   * can show them: the GC doesn't see their native memory.
   */
  frames: Frame[]
  /** The newest frame's number; 0 before the first. */
  frame: number
  last: number | null
  // Totals since the last stats report.
  statsStart: number
  statsFrames: number
  updateMs: number
  drawablesMs: number
  drawMs: number
  drawStats: DrawStats
}

interface Ticker {
  entries: Map<number, Entry>
  running: boolean
  /** When the next frame is due (absolute, so late timer wake-ups don't add up). */
  nextFrameAt: number
  // Totals for the whole loop since loopStatsStart.
  loopStatsStart: number
  loopWorkMs: number
  loopFrames: number
}

const reportError = (message: string) =>
  console.error('[rn-live2d] animation stopped:', message)

function tickerState(): Ticker {
  'worklet'
  const global = globalThis as unknown as { __rnLive2dTicker?: Ticker }
  if (!global.__rnLive2dTicker) {
    global.__rnLive2dTicker = {
      entries: new Map(),
      running: false,
      nextFrameAt: 0,
      loopStatsStart: 0,
      loopWorkMs: 0,
      loopFrames: 0,
    }
  }
  return global.__rnLive2dTicker
}

// The oldest frame a view may be showing.
function oldestShown(slot: Slot) {
  'worklet'
  const shown = slot.view.shown.getDirty()
  return shown >= 0 ? shown : slot.since
}

// A view stopped (paused or unmounted) but keeps showing its last frame, and
// its UI thread may still take a newer one already published. Those frames are
// handed over to it: dropped from the entry unfreed, for the GC to collect.
function releaseView(entry: Entry, slot: Slot) {
  'worklet'
  const oldest = oldestShown(slot)
  entry.frames = entry.frames.filter((f) => f.frame < oldest)
}

// Frees frames older than every view's shown frame, keeping one more: the JS
// thread may have just read the shown picture for a redraw.
function freeFrames(entry: Entry) {
  'worklet'
  const keepFrom = Math.min(...entry.views.map(oldestShown)) - 1
  while (entry.frames.length > 0 && entry.frames[0]!.frame < keepFrom) {
    entry.frames.shift()!.picture.dispose()
  }
}

function stopEntry(ticker: Ticker, id: number, entry: Entry) {
  'worklet'
  // Its views are released: no view can show what's left.
  for (const f of entry.frames) f.picture.dispose()
  entry.frames = []
  ticker.entries.delete(id)
}

function drawEntry(entry: Entry, frameStart: number, wantStats: boolean) {
  'worklet'
  const dt =
    entry.last === null
      ? 0
      : Math.min((frameStart - entry.last) / 1000, MAX_DELTA_SECONDS)
  entry.last = frameStart
  // Timed from here: frameStart is when the whole loop frame began.
  const start = wantStats ? now() : 0
  entry.native.update(dt)
  const updated = wantStats ? now() : 0
  const stats = wantStats ? entry.drawStats : undefined
  let copied = updated
  let picture: SkPicture
  if (entry.nativeDraw) {
    picture = entry.nativeDraw(stats)
  } else {
    const drawables = entry.native.getDrawables()
    copied = wantStats ? now() : 0
    picture = entry.jsDraw!(drawables, stats)
  }
  entry.frame++
  for (const { view } of entry.views) {
    view.target.setBlocking({ frame: entry.frame, picture })
  }
  entry.frames.push({ frame: entry.frame, picture })
  if (wantStats) {
    const end = now()
    entry.statsFrames++
    entry.updateMs += updated - start
    entry.drawablesMs += copied - updated
    entry.drawMs += end - copied
  }
}

function reportEntry(ticker: Ticker, entry: Entry, at: number, frameMs: number) {
  'worklet'
  const elapsed = at - entry.statsStart
  if (elapsed < STATS_INTERVAL_MS || entry.statsFrames === 0) return
  const n = entry.statsFrames
  const s = entry.drawStats
  const stats: Live2DFrameStats = {
    fps: (n * 1000) / elapsed,
    targetFps: 1000 / frameMs,
    workMs: (entry.updateMs + entry.drawablesMs + entry.drawMs) / n,
    updateMs: entry.updateMs / n,
    drawablesMs: entry.drawablesMs / n,
    drawMs: entry.drawMs / n,
    meshMs: s.meshMs / n,
    meshesBuilt: s.meshesBuilt / n,
    layers: s.layers / n,
    models: ticker.entries.size,
    loopWorkMs: ticker.loopFrames > 0 ? ticker.loopWorkMs / ticker.loopFrames : 0,
  }
  for (const { view } of entry.views) {
    if (view.report) scheduleOnRN(view.report, stats)
  }
  entry.statsStart = at
  entry.statsFrames = 0
  entry.updateMs = 0
  entry.drawablesMs = 0
  entry.drawMs = 0
  s.meshMs = 0
  s.meshesBuilt = 0
  s.layers = 0
}

/** Updates and draws every model once. Returns the delay until the next frame, or null to stop. */
function runFrame(): number | null {
  'worklet'
  const ticker = tickerState()
  const frameStart = now()
  let displayMs = 0
  for (const [id, entry] of ticker.entries) {
    const stopped = entry.views.filter((s) => !s.view.running.getDirty())
    if (stopped.length > 0) {
      for (const slot of stopped) releaseView(entry, slot)
      entry.views = entry.views.filter((s) => !stopped.includes(s))
    }
    if (entry.views.length === 0) {
      stopEntry(ticker, id, entry)
      continue
    }
    freeFrames(entry)
    for (const { view } of entry.views) {
      const ms = view.displayMs.getDirty()
      if (ms > 0 && (displayMs === 0 || ms < displayMs)) displayMs = ms
    }
    // The fastest view sets the model's frame rate.
    const capMs = Math.min(...entry.views.map((s) => s.view.capMs))
    if (entry.last !== null && frameStart - entry.last < capMs - CAP_TOLERANCE_MS) {
      continue
    }
    // Wait for a UI thread that's behind, rather than draw frames it won't show.
    if (entry.frame - Math.min(...entry.views.map(oldestShown)) >= MAX_FRAMES_AHEAD) {
      continue
    }
    const wantStats = entry.views.some((s) => s.view.report !== null)
    try {
      drawEntry(entry, frameStart, wantStats)
    } catch (e) {
      // An uncaught error on this runtime aborts the app: drop the model instead.
      for (const slot of entry.views) {
        slot.view.running.setBlocking(false)
        releaseView(entry, slot)
      }
      stopEntry(ticker, id, entry)
      scheduleOnRN(reportError, String((e as Error)?.stack ?? e))
    }
  }

  const end = now()
  ticker.loopWorkMs += end - frameStart
  ticker.loopFrames++
  const interval = Math.min(
    MAX_FRAME_MS,
    Math.max(MIN_FRAME_MS, displayMs || DEFAULT_FRAME_MS)
  )
  for (const entry of ticker.entries.values()) {
    const capMs = Math.min(...entry.views.map((s) => s.view.capMs))
    reportEntry(ticker, entry, end, Math.max(interval, capMs))
  }
  if (end - ticker.loopStatsStart >= STATS_INTERVAL_MS) {
    // Loop stats cover about the last second.
    ticker.loopStatsStart = end
    ticker.loopWorkMs = 0
    ticker.loopFrames = 0
  }

  if (ticker.entries.size === 0) {
    ticker.running = false
    return null
  }
  ticker.nextFrameAt += interval
  // More than a frame behind (a stall, or the first frame): start over from now.
  if (ticker.nextFrameAt < end - interval) ticker.nextFrameAt = end + interval
  return Math.max(0, ticker.nextFrameAt - end)
}

/**
 * Starts showing a model's frames in a view. Call on the live2d runtime; stop
 * by setting `view.running` to false. Views of the same model share its frames.
 */
export function addToTicker(model: TickerModel, view: TickerView) {
  'worklet'
  const ticker = tickerState()
  let entry = ticker.entries.get(model.id)
  if (!entry) {
    try {
      const nativeDraw = createNativeDrawer(model.native, model.canvas)
      entry = {
        native: model.native,
        nativeDraw,
        jsDraw: nativeDraw
          ? null
          : createDrawer(model.textures, model.shaders, model.canvas),
        views: [],
        frames: [],
        frame: 0,
        last: null,
        statsStart: now(),
        statsFrames: 0,
        updateMs: 0,
        drawablesMs: 0,
        drawMs: 0,
        drawStats: { meshMs: 0, meshesBuilt: 0, layers: 0 },
      }
    } catch (e) {
      view.running.setBlocking(false)
      scheduleOnRN(reportError, String((e as Error)?.stack ?? e))
      return
    }
    ticker.entries.set(model.id, entry)
  }
  entry.views.push({ view, since: entry.frame })
  // Joining a model that's already animating: show its newest frame right away.
  const newest = entry.frames[entry.frames.length - 1]
  if (newest) view.target.setBlocking({ frame: newest.frame, picture: newest.picture })
  if (!ticker.running) {
    ticker.running = true
    ticker.nextFrameAt = 0
    ticker.loopStatsStart = now()
    const loop = () => {
      const delay = runFrame()
      if (delay !== null) setTimeout(loop, delay)
    }
    loop()
  }
}

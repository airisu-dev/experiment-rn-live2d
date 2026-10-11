import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useFrameCallback, useSharedValue } from 'react-native-reanimated'
import { Group, Picture, Skia, type SkPicture } from 'react-native-skia'
import {
  createSynchronizable,
  createWorkletRuntime,
  scheduleOnRN,
  scheduleOnRuntime,
  type WorkletRuntime,
} from 'react-native-worklets'
import { now } from './clock'
import { createDrawer, createNativeDrawer, type DrawStats } from './drawer'
import type { Live2DModel } from './loadModel'

export interface Live2DProps {
  model: Live2DModel | null
  /** Top-left position on the canvas. */
  x?: number
  y?: number
  /** Uniform scale of the model's native canvas size. */
  scale?: number
  /** Stops animating and keeps the current frame. */
  paused?: boolean
  /** Caps the frame rate, e.g. 30 to save battery. Default: the display's refresh rate. */
  maxFps?: number
  /** Called about once a second with timings of the animation loop. */
  onFrameStats?: (stats: Live2DFrameStats) => void
}

/** Averages per frame over the last second, in milliseconds unless noted. */
export interface Live2DFrameStats {
  /** Frames drawn per second. */
  fps: number
  /** The frame rate the loop aims for: the display's refresh rate, or `maxFps`. */
  targetFps: number
  /** All work for a frame on the animation thread. */
  workMs: number
  /** Motions, physics and so on in C++ (`update`). */
  updateMs: number
  /** Copying vertex data out of C++ (`getDrawables`). */
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
}

// Longest step per frame, so returning from the background doesn't jump motions and physics.
const MAX_DELTA_SECONDS = 0.1
// Frames kept alive after being replaced, in case the UI thread hasn't drawn them yet.
const KEEP_FRAMES = 4
// Frame time until the display's refresh rate is known, and its limits. The background
// runtime's requestAnimationFrame polls every 16 ms after the previous frame, which halves
// the frame rate, so the loop paces itself with setTimeout instead.
const DEFAULT_FRAME_MS = 1000 / 60
const MIN_FRAME_MS = 1000 / 144
const MAX_FRAME_MS = 1000 / 30
// UI frames per estimate of the display's frame interval.
const DISPLAY_SAMPLE_FRAMES = 60
const STATS_INTERVAL_MS = 1000

// Shown until the model loads. A recorder must begin recording before it can finish.
const emptyRecorder = Skia.PictureRecorder()
emptyRecorder.beginRecording(Skia.XYWHRect(0, 0, 0, 0))
const EMPTY_PICTURE = emptyRecorder.finishRecordingAsPicture()

// Models are updated and drawn on a background thread, so a busy JS thread
// doesn't drop animation frames. One runtime is shared by all <Live2D>s.
let runtime: WorkletRuntime | null = null
const live2dRuntime = () => (runtime ??= createWorkletRuntime({ name: 'live2d' }))

const reportError = (message: string) =>
  console.error('[rn-live2d] animation stopped:', message)

export function Live2D({
  model,
  x = 0,
  y = 0,
  scale = 1,
  paused = false,
  maxFps,
  onFrameStats,
}: Live2DProps) {
  // A shared value lets Skia redraw each frame without a React re-render.
  const picture = useSharedValue<SkPicture>(model?.picture ?? EMPTY_PICTURE)
  // Reset to the load-time frame only when the model changes, so pausing keeps the current frame.
  const shownModel = useRef<Live2DModel | null>(null)
  // The background loop publishes frames here. scheduleOnUI can't be called from
  // a custom worklet runtime (outside Bundle Mode), so the UI thread polls instead.
  const [latest] = useState(() =>
    createSynchronizable<{ frame: number; picture: SkPicture } | null>(null)
  )
  const shownFrame = useSharedValue(-1)
  // The display's frame interval: the shortest over a window of UI frames, so
  // dropped frames don't count. 0 until measured.
  const [displayFrameMs] = useState(() => createSynchronizable(0))
  const sampleMin = useSharedValue(Infinity)
  const sampleCount = useSharedValue(0)
  useFrameCallback(({ timeSincePreviousFrame }) => {
    const next = latest.getDirty()
    if (next && next.frame !== shownFrame.value) {
      shownFrame.value = next.frame
      picture.value = next.picture
    }
    if (timeSincePreviousFrame !== null && timeSincePreviousFrame > 0) {
      sampleMin.value = Math.min(sampleMin.value, timeSincePreviousFrame)
      if (++sampleCount.value >= DISPLAY_SAMPLE_FRAMES) {
        displayFrameMs.setBlocking(sampleMin.value)
        sampleMin.value = Infinity
        sampleCount.value = 0
      }
    }
  })

  // A stable function for the loop to call, reading the latest prop.
  const onFrameStatsRef = useRef(onFrameStats)
  onFrameStatsRef.current = onFrameStats
  const reportStats = useCallback(
    (stats: Live2DFrameStats) => onFrameStatsRef.current?.(stats),
    []
  )
  const wantStats = onFrameStats !== undefined
  const capFrameMs = maxFps ? 1000 / maxFps : 0

  useEffect(() => {
    if (!model) return
    if (shownModel.current !== model) {
      shownModel.current = model
      picture.value = model.picture
    }
    if (paused) return

    // Frame numbers restart with each loop.
    latest.setBlocking(null)
    shownFrame.value = -1
    const running = createSynchronizable(true)
    scheduleOnRuntime(
      live2dRuntime(),
      (native, textures, shaders, canvas, target, isRunning, displayMs, capMs, report) => {
        'worklet'
        // An uncaught error on this runtime aborts the app, so report and stop instead.
        const fail = (e: unknown) => {
          isRunning.setBlocking(false)
          scheduleOnRN(reportError, String((e as Error)?.stack ?? e))
        }
        try {
          // Drawn in C++ when rn-live2d is built with Skia, else in JS.
          const nativeDraw = createNativeDrawer(native, canvas)
          const draw = nativeDraw ? null : createDrawer(textures, shaders, canvas)
          // Frames drawn by this loop, newest last. Freed explicitly because the
          // GC doesn't see their native memory; the newest is never freed.
          const shown: SkPicture[] = []
          let last: number | null = null
          let frame = 0
          // When the next frame is due. Waiting until an absolute time, not for a fixed
          // delay, keeps late timer wake-ups (about 4 ms on iOS) from adding up.
          let nextFrameAt = 0
          const frameMs = () =>
            Math.min(
              MAX_FRAME_MS,
              Math.max(MIN_FRAME_MS, capMs, displayMs.getDirty() || DEFAULT_FRAME_MS)
            )

          // Totals since the last stats report.
          let statsStart = now()
          let statsFrames = 0
          let updateMs = 0
          let drawablesMs = 0
          let drawMs = 0
          const drawStats: DrawStats = { meshMs: 0, meshesBuilt: 0, layers: 0 }

          const tick = () => {
            if (!isRunning.getDirty()) return
            try {
              const frameStart = now()
              const dt =
                last === null
                  ? 0
                  : Math.min((frameStart - last) / 1000, MAX_DELTA_SECONDS)
              last = frameStart
              native.update(dt)
              const updated = report ? now() : 0
              const stats = report ? drawStats : undefined
              const drawables = draw ? native.getDrawables() : null
              const copied = report ? now() : 0
              const next = draw ? draw(drawables!, stats) : nativeDraw!(stats)
              target.setBlocking({ frame: ++frame, picture: next })
              shown.push(next)
              if (shown.length > KEEP_FRAMES) shown.shift()!.dispose()
              const end = now()

              if (report) {
                statsFrames++
                updateMs += updated - frameStart
                drawablesMs += copied - updated
                drawMs += end - copied
                const elapsed = end - statsStart
                if (elapsed >= STATS_INTERVAL_MS) {
                  const n = statsFrames
                  scheduleOnRN(report, {
                    fps: (n * 1000) / elapsed,
                    targetFps: 1000 / frameMs(),
                    workMs: (updateMs + drawablesMs + drawMs) / n,
                    updateMs: updateMs / n,
                    drawablesMs: drawablesMs / n,
                    drawMs: drawMs / n,
                    meshMs: drawStats.meshMs / n,
                    meshesBuilt: drawStats.meshesBuilt / n,
                    layers: drawStats.layers / n,
                  })
                  statsStart = end
                  statsFrames = 0
                  updateMs = 0
                  drawablesMs = 0
                  drawMs = 0
                  drawStats.meshMs = 0
                  drawStats.meshesBuilt = 0
                  drawStats.layers = 0
                }
              }
              const interval = frameMs()
              nextFrameAt += interval
              // More than a frame behind (a stall, or the first frame): start over from now.
              if (nextFrameAt < end - interval) nextFrameAt = end + interval
              setTimeout(tick, Math.max(0, nextFrameAt - end))
            } catch (e) {
              fail(e)
            }
          }
          tick()
        } catch (e) {
          fail(e)
        }
      },
      model.native,
      model.textures,
      model.shaders,
      model.canvas,
      latest,
      running,
      displayFrameMs,
      capFrameMs,
      wantStats ? reportStats : null
    )
    return () => running.setBlocking(false)
  }, [
    model,
    paused,
    picture,
    latest,
    shownFrame,
    displayFrameMs,
    capFrameMs,
    wantStats,
    reportStats,
  ])

  if (!model) return null
  return (
    <Group transform={[{ translateX: x }, { translateY: y }, { scale }]}>
      <Picture picture={picture} />
    </Group>
  )
}

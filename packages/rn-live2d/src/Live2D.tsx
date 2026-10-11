import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useFrameCallback, useSharedValue } from 'react-native-reanimated'
import { Group, Picture, Skia, type SkPicture } from 'react-native-skia'
import {
  createSynchronizable,
  createWorkletRuntime,
  scheduleOnRuntime,
  type WorkletRuntime,
} from 'react-native-worklets'
import type { Live2DModel } from './loadModel'
import {
  addToTicker,
  type Live2DFrameStats,
  type PublishedFrame,
} from './ticker'

export type { Live2DFrameStats } from './ticker'

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

// UI frames per estimate of the display's frame interval.
const DISPLAY_SAMPLE_FRAMES = 60

// Shown until the model loads. A recorder must begin recording before it can finish.
const emptyRecorder = Skia.PictureRecorder()
emptyRecorder.beginRecording(Skia.XYWHRect(0, 0, 0, 0))
const EMPTY_PICTURE = emptyRecorder.finishRecordingAsPicture()

// Models are updated and drawn on a background thread, so a busy JS thread
// doesn't drop animation frames. One runtime, and one loop on it (ticker.ts),
// animates every <Live2D>.
let runtime: WorkletRuntime | null = null
const live2dRuntime = () => (runtime ??= createWorkletRuntime({ name: 'live2d' }))

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
  // The loop publishes frames here. scheduleOnUI can't be called from a custom
  // worklet runtime (outside Bundle Mode), so the UI thread polls instead.
  const [latest] = useState(() => createSynchronizable<PublishedFrame>(null))
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

    // Frame numbers restart when the model starts animating again.
    latest.setBlocking(null)
    shownFrame.value = -1
    const running = createSynchronizable(true)
    scheduleOnRuntime(
      live2dRuntime(),
      addToTicker,
      {
        id: model.id,
        native: model.native,
        textures: model.textures,
        shaders: model.shaders,
        canvas: model.canvas,
      },
      {
        target: latest,
        running,
        displayMs: displayFrameMs,
        capMs: capFrameMs,
        report: wantStats ? reportStats : null,
      }
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

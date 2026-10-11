import React, { useEffect, useRef, useState } from 'react'
import { useFrameCallback, useSharedValue } from 'react-native-reanimated'
import { Group, Picture, Skia, type SkPicture } from 'react-native-skia'
import {
  createSynchronizable,
  createWorkletRuntime,
  scheduleOnRN,
  scheduleOnRuntime,
  type WorkletRuntime,
} from 'react-native-worklets'
import { createDrawer } from './drawer'
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
}

// Longest step per frame, so returning from the background doesn't jump motions and physics.
const MAX_DELTA_SECONDS = 0.1
// Frames kept alive after being replaced, in case the UI thread hasn't drawn them yet.
const KEEP_FRAMES = 4
// Target frame time. The background runtime's requestAnimationFrame polls every 16 ms
// after the previous frame, which halves the frame rate, so pace with setTimeout instead.
const FRAME_MS = 1000 / 60

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
  useFrameCallback(() => {
    const next = latest.getDirty()
    if (next && next.frame !== shownFrame.value) {
      shownFrame.value = next.frame
      picture.value = next.picture
    }
  })

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
      (native, textures, shaders, canvas, target, isRunning) => {
        'worklet'
        // An uncaught error on this runtime aborts the app, so report and stop instead.
        const fail = (e: unknown) => {
          isRunning.setBlocking(false)
          scheduleOnRN(reportError, String((e as Error)?.stack ?? e))
        }
        try {
          const draw = createDrawer(textures, shaders, canvas)
          // Frames drawn by this loop, newest last. Freed explicitly because the
          // GC doesn't see their native memory; the newest is never freed.
          const shown: SkPicture[] = []
          let last: number | null = null
          let frame = 0
          const tick = () => {
            if (!isRunning.getDirty()) return
            try {
              const now = Date.now()
              const dt =
                last === null
                  ? 0
                  : Math.min((now - last) / 1000, MAX_DELTA_SECONDS)
              last = now
              native.update(dt)
              const next = draw(native.getDrawables())
              target.setBlocking({ frame: ++frame, picture: next })
              shown.push(next)
              if (shown.length > KEEP_FRAMES) shown.shift()!.dispose()
              setTimeout(tick, Math.max(0, FRAME_MS - (Date.now() - now)))
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
      running
    )
    return () => running.setBlocking(false)
  }, [model, paused, picture, latest, shownFrame])

  if (!model) return null
  return (
    <Group transform={[{ translateX: x }, { translateY: y }, { scale }]}>
      <Picture picture={picture} />
    </Group>
  )
}

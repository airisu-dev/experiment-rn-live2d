import React, { useEffect, useRef } from 'react'
import { useSharedValue } from 'react-native-reanimated'
import { Group, Picture, Skia, type SkPicture } from 'react-native-skia'
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
// Frames kept alive after being replaced, in case the UI thread is still drawing them.
const KEEP_FRAMES = 3

// Shown until the model loads. A recorder must begin recording before it can finish.
const emptyRecorder = Skia.PictureRecorder()
emptyRecorder.beginRecording(Skia.XYWHRect(0, 0, 0, 0))
const EMPTY_PICTURE = emptyRecorder.finishRecordingAsPicture()

export function Live2D({
  model,
  x = 0,
  y = 0,
  scale = 1,
  paused = false,
}: Live2DProps) {
  // A shared value lets Skia redraw each frame without a React re-render.
  const picture = useSharedValue<SkPicture>(model?.picture ?? EMPTY_PICTURE)
  // The newest frame drawn for a model (never disposed), so pausing keeps it on screen.
  const latest = useRef<{ model: Live2DModel; picture: SkPicture } | null>(null)

  useEffect(() => {
    if (!model) return
    picture.value =
      latest.current?.model === model ? latest.current.picture : model.picture
    if (paused) return

    let last: number | null = null
    // Pictures drawn by this loop, newest last. model.picture is never disposed.
    const shown: SkPicture[] = []
    let frame = requestAnimationFrame(function tick(now) {
      const dt =
        last === null ? 0 : Math.min((now - last) / 1000, MAX_DELTA_SECONDS)
      last = now
      model.native.update(dt)
      const next = model.draw()
      picture.value = next
      latest.current = { model, picture: next }
      // Free old frames explicitly: the GC doesn't see their native memory, so
      // they pile up. Wait a couple of frames so the UI thread is done with them.
      shown.push(next)
      if (shown.length > KEEP_FRAMES) shown.shift()!.dispose()
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [model, paused, picture])

  if (!model) return null
  return (
    <Group transform={[{ translateX: x }, { translateY: y }, { scale }]}>
      <Picture picture={picture} />
    </Group>
  )
}

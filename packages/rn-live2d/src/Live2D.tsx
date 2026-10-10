import React from 'react'
import { Group, Picture } from 'react-native-skia'
import type { Live2DModel } from './loadModel'

export interface Live2DProps {
  model: Live2DModel | null
  /** Top-left position on the canvas. */
  x?: number
  y?: number
  /** Uniform scale of the model's native canvas size. */
  scale?: number
}

export function Live2D({ model, x = 0, y = 0, scale = 1 }: Live2DProps) {
  if (!model) return null
  return (
    <Group transform={[{ translateX: x }, { translateY: y }, { scale }]}>
      <Picture picture={model.picture} />
    </Group>
  )
}

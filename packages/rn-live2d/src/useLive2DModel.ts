import { useEffect, useState } from 'react'
import {
  loadLive2DModel,
  type Live2DModel,
  type Live2DModelSource,
} from './loadModel'
import type { Live2DModelContext } from './modelContext'

/**
 * Loads a model once on mount. Returns `null` until it's ready.
 * Throws the load error during render so an error boundary can catch it.
 */
export function useLive2DModel(
  source: Live2DModelSource | Live2DModelContext
): Live2DModel | null {
  const [model, setModel] = useState<Live2DModel | null>(null)
  const [error, setError] = useState<unknown>(null)
  // The source is require() ids or a require.context, which never change for a mounted component.
  // Wrapped: a require.context is a function, which useState would call as an initializer.
  const [initialSource] = useState(() => source)

  useEffect(() => {
    let cancelled = false
    loadLive2DModel(initialSource).then(
      (m) => !cancelled && setModel(m),
      (e) => !cancelled && setError(e)
    )
    return () => {
      cancelled = true
    }
  }, [initialSource])

  if (error) throw error
  return model
}

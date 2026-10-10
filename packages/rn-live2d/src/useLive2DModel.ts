import { useEffect, useState } from 'react'
import {
  loadLive2DModel,
  type Live2DModel,
  type Live2DModelSource,
} from './loadModel'

/**
 * Loads a model once on mount. Returns `null` until it's ready.
 * Throws the load error during render so an error boundary can catch it.
 */
export function useLive2DModel(source: Live2DModelSource): Live2DModel | null {
  const [model, setModel] = useState<Live2DModel | null>(null)
  const [error, setError] = useState<unknown>(null)
  // The source is a set of require() ids, which never change for a mounted component.
  const [initialSource] = useState(source)

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

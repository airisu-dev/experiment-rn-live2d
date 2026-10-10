import { NitroModules } from 'react-native-nitro-modules'
import type { RnLive2d as RnLive2dSpec } from './specs/rn-live2d.nitro'

export const RnLive2d =
  NitroModules.createHybridObject<RnLive2dSpec>('RnLive2d')
import type { HybridObject } from 'react-native-nitro-modules'

export interface RnLive2d extends HybridObject<{ ios: 'c++', android: 'c++' }> {
  sum(num1: number, num2: number): number
}
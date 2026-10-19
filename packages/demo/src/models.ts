/// <reference types="expo/types" />
// Metro's require.context types, whichever app compiles this.
import type { Live2DModelContext } from 'rn-live2d';

// Sample models from the Cubism SDK, copied to packages/demo/assets/live2d/ by `bun run fetch:cubism`.
// Each is a require.context of the model's folder: the files its model3.json lists
// are looked up in it. Metro needs the folder path as a string literal.
// Haru loads from the network instead: the URL of its model3.json.
export const MODELS: Record<'Hiyori' | 'Mao' | 'Haru', Live2DModelContext | string> = {
  Hiyori: require.context('../assets/live2d/Hiyori', true, /\.(json|moc3|png)$/),
  Mao: require.context('../assets/live2d/Mao', true, /\.(json|moc3|png)$/),
  Haru: 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t03.model3.json',
};

export type ModelName = keyof typeof MODELS;
export const MODEL_NAMES = Object.keys(MODELS) as ModelName[];

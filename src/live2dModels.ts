// Sample models from the Cubism SDK, copied to assets/live2d/ by `bun run fetch:cubism`.
// Each is a require.context of the model's folder: the files its model3.json lists
// are looked up in it. Metro needs the folder path as a string literal.
export const MODELS = {
  Hiyori: require.context('../assets/live2d/Hiyori', true, /\.(json|moc3|png)$/),
  Mao: require.context('../assets/live2d/Mao', true, /\.(json|moc3|png)$/),
};

export type ModelName = keyof typeof MODELS;
export const MODEL_NAMES = Object.keys(MODELS) as ModelName[];

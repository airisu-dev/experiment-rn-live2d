import type { Live2DModelSource } from 'rn-live2d';

// Sample models from the Cubism SDK, copied to assets/live2d/ by `bun run fetch:cubism`.
// Lists follow each model's model3.json `FileReferences`.
export const MODELS = {
  Hiyori: {
    settings: require('@/assets/live2d/Hiyori/Hiyori.model3.json'),
    moc: require('@/assets/live2d/Hiyori/Hiyori.moc3'),
    textures: [
      require('@/assets/live2d/Hiyori/Hiyori.2048/texture_00.png'),
      require('@/assets/live2d/Hiyori/Hiyori.2048/texture_01.png'),
    ],
    physics: require('@/assets/live2d/Hiyori/Hiyori.physics3.json'),
    pose: require('@/assets/live2d/Hiyori/Hiyori.pose3.json'),
    motions: {
      Idle: [
        require('@/assets/live2d/Hiyori/motions/Hiyori_m01.motion3.json'),
        require('@/assets/live2d/Hiyori/motions/Hiyori_m02.motion3.json'),
        require('@/assets/live2d/Hiyori/motions/Hiyori_m03.motion3.json'),
        require('@/assets/live2d/Hiyori/motions/Hiyori_m05.motion3.json'),
        require('@/assets/live2d/Hiyori/motions/Hiyori_m06.motion3.json'),
        require('@/assets/live2d/Hiyori/motions/Hiyori_m07.motion3.json'),
        require('@/assets/live2d/Hiyori/motions/Hiyori_m08.motion3.json'),
        require('@/assets/live2d/Hiyori/motions/Hiyori_m09.motion3.json'),
        require('@/assets/live2d/Hiyori/motions/Hiyori_m10.motion3.json'),
      ],
      TapBody: [require('@/assets/live2d/Hiyori/motions/Hiyori_m04.motion3.json')],
    },
  },
  Mao: {
    settings: require('@/assets/live2d/Mao/Mao.model3.json'),
    moc: require('@/assets/live2d/Mao/Mao.moc3'),
    textures: [require('@/assets/live2d/Mao/Mao.2048/texture_00.png')],
    physics: require('@/assets/live2d/Mao/Mao.physics3.json'),
    pose: require('@/assets/live2d/Mao/Mao.pose3.json'),
    motions: {
      Idle: [
        require('@/assets/live2d/Mao/motions/mtn_01.motion3.json'),
        require('@/assets/live2d/Mao/motions/sample_01.motion3.json'),
      ],
      TapBody: [
        require('@/assets/live2d/Mao/motions/mtn_02.motion3.json'),
        require('@/assets/live2d/Mao/motions/mtn_03.motion3.json'),
        require('@/assets/live2d/Mao/motions/mtn_04.motion3.json'),
        require('@/assets/live2d/Mao/motions/special_01.motion3.json'),
        require('@/assets/live2d/Mao/motions/special_02.motion3.json'),
        require('@/assets/live2d/Mao/motions/special_03.motion3.json'),
      ],
    },
    expressions: {
      exp_01: require('@/assets/live2d/Mao/expressions/exp_01.exp3.json'),
      exp_02: require('@/assets/live2d/Mao/expressions/exp_02.exp3.json'),
      exp_03: require('@/assets/live2d/Mao/expressions/exp_03.exp3.json'),
      exp_04: require('@/assets/live2d/Mao/expressions/exp_04.exp3.json'),
      exp_05: require('@/assets/live2d/Mao/expressions/exp_05.exp3.json'),
      exp_06: require('@/assets/live2d/Mao/expressions/exp_06.exp3.json'),
      exp_07: require('@/assets/live2d/Mao/expressions/exp_07.exp3.json'),
      exp_08: require('@/assets/live2d/Mao/expressions/exp_08.exp3.json'),
    },
  },
} satisfies Record<string, Live2DModelSource>;

export type ModelName = keyof typeof MODELS;
export const MODEL_NAMES = Object.keys(MODELS) as ModelName[];

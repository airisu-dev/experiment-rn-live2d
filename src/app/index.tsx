import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Canvas } from 'react-native-skia';
import { Live2D, useLive2DModel, type Live2DModelSource } from 'rn-live2d';

const MODELS = {
  Hiyori: {
    moc: require('@/assets/live2d/Hiyori/Hiyori.moc3'),
    textures: [
      require('@/assets/live2d/Hiyori/Hiyori.2048/texture_00.png'),
      require('@/assets/live2d/Hiyori/Hiyori.2048/texture_01.png'),
    ],
    pose: require('@/assets/live2d/Hiyori/Hiyori.pose3.json'),
  },
  Mao: {
    moc: require('@/assets/live2d/Mao/Mao.moc3'),
    textures: [require('@/assets/live2d/Mao/Mao.2048/texture_00.png')],
    pose: require('@/assets/live2d/Mao/Mao.pose3.json'),
  },
} satisfies Record<string, Live2DModelSource>;

type ModelName = keyof typeof MODELS;
const MODEL_NAMES = Object.keys(MODELS) as ModelName[];

export default function Home() {
  const [name, setName] = useState<ModelName>('Hiyori');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.switcher}>
        {MODEL_NAMES.map((n) => (
          <Pressable
            key={n}
            onPress={() => setName(n)}
            style={[styles.option, n === name && styles.optionActive]}
          >
            <Text
              style={[styles.optionText, n === name && styles.optionTextActive]}
            >
              {n}
            </Text>
          </Pressable>
        ))}
      </View>
      {/* useLive2DModel loads once per mount, so remount the view per model. */}
      <ModelView key={name} source={MODELS[name]} />
    </SafeAreaView>
  );
}

function ModelView({ source }: { source: Live2DModelSource }) {
  const model = useLive2DModel(source);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);

  // Fit the model's canvas inside the view, centered.
  const scale = model
    ? Math.min(size.width / model.width, size.height / model.height)
    : 1;
  const x = model ? (size.width - model.width * scale) / 2 : 0;
  const y = model ? (size.height - model.height * scale) / 2 : 0;

  return (
    <View style={styles.modelView} onLayout={onLayout}>
      <Canvas style={styles.canvas}>
        <Live2D model={model} x={x} y={y} scale={scale} />
      </Canvas>
      {!model && <Text style={styles.loading}>Loading model…</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  switcher: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: 8,
    padding: 4,
    borderRadius: 999,
    backgroundColor: '#eef1f5',
  },
  option: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 999 },
  optionActive: { backgroundColor: '#208AEF' },
  optionText: { fontSize: 15, fontWeight: '600', color: '#4a5563' },
  optionTextActive: { color: '#fff' },
  modelView: { flex: 1 },
  canvas: { flex: 1 },
  loading: { position: 'absolute', alignSelf: 'center', top: '50%' },
});

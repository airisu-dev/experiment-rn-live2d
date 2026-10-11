import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Canvas } from 'react-native-skia';
import {
  Live2D,
  useLive2DGesture,
  useLive2DModel,
  type Live2DFrameStats,
  type Live2DModelContext,
} from 'rn-live2d';
import { MODEL_NAMES, MODELS, type ModelName } from '@/live2dModels';

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

function ModelView({ source }: { source: Live2DModelContext }) {
  const model = useLive2DModel(source);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [stats, setStats] = useState<Live2DFrameStats | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);

  // Fit the model's canvas inside the view, centered.
  const scale = model
    ? Math.min(size.width / model.width, size.height / model.height)
    : 1;
  const x = model ? (size.width - model.width * scale) / 2 : 0;
  const y = model ? (size.height - model.height * scale) / 2 : 0;
  // Follow the finger; tap the body (or Mao's head) to play a motion (or expression).
  const gesture = useLive2DGesture(model, { x, y, scale });

  return (
    <View style={styles.modelView} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <Canvas style={styles.canvas}>
          <Live2D
            model={model}
            x={x}
            y={y}
            scale={scale}
            onFrameStats={setStats}
          />
        </Canvas>
      </GestureDetector>
      {!model && <Text style={styles.loading}>Loading model…</Text>}
      {stats && <Text style={styles.stats}>{formatStats(stats)}</Text>}
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
  stats: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#4a5563',
  },
});

// Animation loop timings, per frame, for checking performance on a device.
function formatStats(s: Live2DFrameStats) {
  const ms = (v: number) => v.toFixed(1);
  return [
    `${s.fps.toFixed(0)}/${s.targetFps.toFixed(0)} fps · work ${ms(s.workMs)} ms`,
    `update ${ms(s.updateMs)} · copy ${ms(s.drawablesMs)} · draw ${ms(s.drawMs)} (mesh ${ms(s.meshMs)})`,
    `meshes ${s.meshesBuilt.toFixed(0)} · layers ${s.layers.toFixed(0)}`,
  ].join('\n');
}

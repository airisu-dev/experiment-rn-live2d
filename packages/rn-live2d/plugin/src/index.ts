// Expo config plugin: tells the native builds where the Cubism SDK for Native is.
//
//   "plugins": [["rn-live2d", { "cubismSdkPath": "./vendor/CubismSdkForNative" }]]
//
// Cubism Core is proprietary and isn't shipped with this package: each app
// downloads the SDK from Live2D (`rn-live2d fetch-sdk`), which means accepting
// Live2D's license. The path is relative to the app's root.
import fs from 'fs'
import path from 'path'
import {
  createRunOncePlugin,
  withGradleProperties,
  withPodfileProperties,
  type ConfigPlugin,
} from 'expo/config-plugins'

export interface RnLive2dPluginProps {
  /** Cubism SDK for Native folder (the one with `cubism-info.yml`), relative to the app's root. */
  cubismSdkPath: string
}

// Read by android/build.gradle and RnLive2d.podspec.
const SDK_PROPERTY = 'rnLive2d.cubismSdkPath'
const SKIA_PROPERTY = 'rnLive2d.skiaPackage'

// The Skia packages rn-live2d can draw with in C++, by preference.
const SKIA_PACKAGES = ['react-native-skia', '@shopify/react-native-skia']

const FETCH_HINT =
  'Download it with `rn-live2d fetch-sdk --accept-license` (through npx, bunx, yarn or pnpm).'

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
) as { name: string; version: string }

// Paths are written relative to the native folder, so a prebuilt project
// still builds after it's moved or checked out somewhere else.
const relativeTo = (dir: string, target: string) =>
  path.relative(dir, target).split(path.sep).join('/')

const withRnLive2d: ConfigPlugin<RnLive2dPluginProps | undefined> = (
  config,
  props
) => {
  const sdkPath = props?.cubismSdkPath
  if (!sdkPath) {
    throw new Error(
      '[rn-live2d] Set the Cubism SDK for Native folder: ' +
        '["rn-live2d", { "cubismSdkPath": "./vendor/CubismSdkForNative" }]. ' +
        FETCH_HINT
    )
  }

  const properties = (projectRoot: string, platformProjectRoot: string) => {
    const sdkDir = path.resolve(projectRoot, sdkPath)
    return {
      [SDK_PROPERTY]: relativeTo(platformProjectRoot, sdkDir),
      [SKIA_PROPERTY]: skiaPackageOf(projectRoot),
    }
  }

  config = withGradleProperties(config, (c) => {
    const { projectRoot, platformProjectRoot } = c.modRequest
    warnIfMissing(path.resolve(projectRoot, sdkPath))
    const values = properties(projectRoot, platformProjectRoot)
    c.modResults = c.modResults.filter(
      (item) => !(item.type === 'property' && item.key in values)
    )
    for (const [key, value] of Object.entries(values)) {
      c.modResults.push({ type: 'property', key, value })
    }
    return c
  })

  config = withPodfileProperties(config, (c) => {
    const { projectRoot, platformProjectRoot } = c.modRequest
    Object.assign(c.modResults, properties(projectRoot, platformProjectRoot))
    return c
  })

  return config
}

// The Skia package the app depends on, by its own package.json: in a monorepo
// both can be installed, but an app uses one. Empty when it has neither: the
// native build then leaves out the C++ drawer.
function skiaPackageOf(projectRoot: string): string {
  const appPackage = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
  ) as { dependencies?: Record<string, string> }
  const found = SKIA_PACKAGES.filter((name) => appPackage.dependencies?.[name])
  if (found.length > 1) {
    console.warn(
      `[rn-live2d] The app depends on both ${found.join(' and ')}: drawing with ${found[0]}. Skia says not to install both.`
    )
  }
  if (found.length === 0) {
    console.warn(
      `[rn-live2d] The app depends on neither ${SKIA_PACKAGES.join(' nor ')}. Install one: rn-live2d draws with Skia.`
    )
  }
  return found[0] ?? ''
}

// Not an error: CI may fetch the SDK after prebuild. The native build checks again.
function warnIfMissing(sdkDir: string) {
  if (!fs.existsSync(path.join(sdkDir, 'cubism-info.yml'))) {
    console.warn(
      `[rn-live2d] Cubism SDK for Native not found at ${sdkDir}. ${FETCH_HINT}`
    )
  }
}

export default createRunOncePlugin(withRnLive2d, pkg.name, pkg.version)

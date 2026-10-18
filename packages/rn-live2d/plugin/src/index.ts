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
const PROPERTY = 'rnLive2d.cubismSdkPath'

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

  config = withGradleProperties(config, (c) => {
    const sdkDir = path.resolve(c.modRequest.projectRoot, sdkPath)
    warnIfMissing(sdkDir)
    c.modResults = c.modResults.filter(
      (item) => !(item.type === 'property' && item.key === PROPERTY)
    )
    c.modResults.push({
      type: 'property',
      key: PROPERTY,
      value: relativeTo(c.modRequest.platformProjectRoot, sdkDir),
    })
    return c
  })

  config = withPodfileProperties(config, (c) => {
    const sdkDir = path.resolve(c.modRequest.projectRoot, sdkPath)
    c.modResults[PROPERTY] = relativeTo(
      c.modRequest.platformProjectRoot,
      sdkDir
    )
    return c
  })

  return config
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

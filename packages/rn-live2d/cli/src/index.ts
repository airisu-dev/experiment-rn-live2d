#!/usr/bin/env node
// rn-live2d fetch-sdk --accept-license [--out <dir>] [--keep-zip]
//
// Downloads Cubism SDK for Native from Live2D into <dir> (default
// ./vendor/CubismSdkForNative), for the rn-live2d config plugin's
// `cubismSdkPath`. The SDK's Core is proprietary: this package doesn't ship
// it, and downloading it means accepting Live2D's license terms.
import { spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

interface Args {
  command: string | undefined
  acceptLicense: boolean
  out: string
  keepZip: boolean
}

// Two levels up from both cli/src and cli/build.
const { cubismSdk } = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
) as { cubismSdk: { version: string; sha256: string } }

const URL = `https://cubism.live2d.com/sdk-native/bin/CubismSdkForNative-${cubismSdk.version}.zip`
const DEFAULT_OUT = 'vendor/CubismSdkForNative'
const LICENSES = [
  'Live2D Proprietary Software License (Cubism Core): https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html',
  'Live2D Open Software License (Cubism Native Framework): https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html',
  'Cubism SDK Release License (required to publish apps, for businesses above 10M JPY a year): https://www.live2d.com/en/sdk/license/',
]

function usage() {
  console.log(`Usage: rn-live2d fetch-sdk --accept-license [--out <dir>] [--keep-zip]

Downloads Cubism SDK for Native ${cubismSdk.version} from Live2D into <dir>
(default: ./${DEFAULT_OUT}). Then set it in app.json:

  "plugins": [["rn-live2d", { "cubismSdkPath": "./${DEFAULT_OUT}" }]]

--accept-license  Required: you accept Live2D's license terms:
${LICENSES.map((l) => `                    - ${l}`).join('\n')}
--out <dir>       Where to extract the SDK.
--keep-zip        Keep the downloaded zip next to <dir> (e.g. to cache it on CI).`)
}

function fail(message: string): never {
  console.error(`error: ${message}`)
  process.exit(1)
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: argv[0],
    acceptLicense: false,
    out: DEFAULT_OUT,
    keepZip: false,
  }
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--accept-license') args.acceptLicense = true
    else if (arg === '--keep-zip') args.keepZip = true
    else if (arg === '--out' && next) {
      args.out = next
      i++
    } else if (arg === '--help' || arg === '-h') args.command = 'help'
    else fail(`unknown option ${arg}`)
  }
  return args
}

const sha256 = (file: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

async function download(url: string, file: string) {
  console.log(`Downloading ${url}`)
  const response = await fetch(url)
  if (!response.ok) fail(`download failed: HTTP ${response.status}`)
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()))
}

// unzip where it exists (macOS, most Linux), else tar, which reads zips on
// Windows 10+ (bsdtar) and macOS.
function extract(zip: string, dir: string) {
  const hasUnzip = !spawnSync('unzip', ['-v'], { stdio: 'ignore' }).error
  const [cmd, args] = hasUnzip
    ? ['unzip', ['-q', zip, '-d', dir]]
    : ['tar', ['-xf', zip, '-C', dir]]
  const result = spawnSync(cmd, args, { stdio: 'inherit' })
  if (result.error || result.status !== 0) {
    fail(`couldn't extract ${zip} with ${cmd}`)
  }
}

async function fetchSdk({ acceptLicense, out, keepZip }: Args) {
  if (!acceptLicense) {
    console.error(
      "Cubism SDK for Native is Live2D's software. Downloading it means accepting:\n" +
        LICENSES.map((l) => `  - ${l}`).join('\n') +
        '\nRe-run with --accept-license to accept them and download.'
    )
    process.exit(1)
  }

  const sdkDir = path.resolve(out)
  const versionFile = path.join(sdkDir, '.version')
  if (
    fs.existsSync(versionFile) &&
    fs.readFileSync(versionFile, 'utf8').trim() === cubismSdk.version
  ) {
    console.log(`Cubism SDK for Native ${cubismSdk.version} already in ${sdkDir}`)
    return
  }

  const zip = `${sdkDir}-${cubismSdk.version}.zip`
  fs.mkdirSync(path.dirname(sdkDir), { recursive: true })
  if (!fs.existsSync(zip) || sha256(zip) !== cubismSdk.sha256) {
    await download(URL, zip)
  }
  const actual = sha256(zip)
  if (actual !== cubismSdk.sha256) {
    fs.rmSync(zip, { force: true })
    fail(`checksum mismatch for ${zip} (expected ${cubismSdk.sha256}, got ${actual})`)
  }

  // Extract next to the destination, so the move is a rename on the same drive.
  const tmp = `${sdkDir}.extracting`
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp)
  try {
    extract(zip, tmp)
    fs.rmSync(sdkDir, { recursive: true, force: true })
    fs.renameSync(path.join(tmp, `CubismSdkForNative-${cubismSdk.version}`), sdkDir)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  fs.writeFileSync(versionFile, `${cubismSdk.version}\n`)
  if (!keepZip) fs.rmSync(zip, { force: true })

  const relative = path.relative(process.cwd(), sdkDir).split(path.sep).join('/')
  console.log(`Extracted Cubism SDK for Native ${cubismSdk.version} to ${sdkDir}

Next:
  - Keep it out of public repos: add "/${relative}/" to .gitignore.
  - Set it in app.json: "plugins": [["rn-live2d", { "cubismSdkPath": "./${relative}" }]]
  - On EAS Build, run this command in an "eas-build-post-install" script.`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.command === 'fetch-sdk') await fetchSdk(args)
  else {
    usage()
    if (args.command && args.command !== 'help') process.exit(1)
  }
}

main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)))

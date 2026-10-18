require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# Cubism SDK for Native: proprietary, so each app downloads it from Live2D and
# sets its folder (app.plugin.js writes rnLive2d.cubismSdkPath to
# Podfile.properties.json, relative to ios/).
ios_dir = Pod::Config.instance.installation_root.to_s
podfile_properties_path = File.join(ios_dir, "Podfile.properties.json")
podfile_properties = File.exist?(podfile_properties_path) ? JSON.parse(File.read(podfile_properties_path)) : {}
configured_sdk_dir = ENV["RN_LIVE2D_CUBISM_SDK"] || podfile_properties["rnLive2d.cubismSdkPath"]
unless configured_sdk_dir
  raise "[rn-live2d] Cubism SDK for Native isn't configured. Add the plugin to app.json: " \
        "[\"rn-live2d\", { \"cubismSdkPath\": \"./vendor/CubismSdkForNative\" }], download the SDK with " \
        "`rn-live2d fetch-sdk --accept-license` (through npx, bunx, yarn or pnpm), then prebuild."
end
cubism_sdk_dir = File.expand_path(configured_sdk_dir, ios_dir)
cubism_info = File.join(cubism_sdk_dir, "cubism-info.yml")
unless File.file?(cubism_info)
  raise "[rn-live2d] Cubism SDK for Native not found at #{cubism_sdk_dir} (no cubism-info.yml). " \
        "Download it with `rn-live2d fetch-sdk --accept-license` (through npx, bunx, yarn or pnpm)."
end
cubism_version = File.read(cubism_info)[/^version:\s*(\S+)/, 1] || "unknown"
supported_version = package["cubismSdk"]["version"]
if cubism_version.split("-").first != supported_version.split("-").first
  raise "[rn-live2d] Cubism SDK for Native #{cubism_version} at #{cubism_sdk_dir} isn't supported: use #{supported_version}."
end
if cubism_version != supported_version
  Pod::UI.warn "[rn-live2d] Cubism SDK for Native #{cubism_version} found, tested with #{supported_version}."
end

# CocoaPods only compiles files inside the pod, and the SDK ships one Core static
# library per slice. So copy the Framework source in, and package the Core
# slices as an xcframework (CocoaPods then links the right one for device or
# simulator). Redone when the SDK's folder or version changes. Gitignored, not published.
cubism_stage_dir = File.join(__dir__, "cubism-sdk")
cubism_stamp = "#{cubism_sdk_dir}\n#{cubism_version}\n"
cubism_stamp_path = File.join(cubism_stage_dir, ".stamp")
unless File.exist?(cubism_stamp_path) && File.read(cubism_stamp_path) == cubism_stamp
  require "fileutils"
  require "tmpdir"
  FileUtils.rm_rf(cubism_stage_dir)
  FileUtils.mkdir_p(cubism_stage_dir)
  FileUtils.cp_r(File.join(cubism_sdk_dir, "Framework", "src"), File.join(cubism_stage_dir, "Framework"))
  core = File.join(cubism_sdk_dir, "Core")
  FileUtils.mkdir_p(File.join(cubism_stage_dir, "Core"))
  FileUtils.cp_r(File.join(core, "include"), File.join(cubism_stage_dir, "Core", "include"))
  lib = File.join(core, "lib", "ios")
  Dir.mktmpdir do |tmp|
    simulator_lib = File.join(tmp, "libLive2DCubismCore.a")
    run = lambda do |*cmd|
      system(*cmd) or raise "[rn-live2d] Failed to package Cubism Core: #{cmd.join(' ')}"
    end
    run.call("lipo", "-create",
             File.join(lib, "Release-iphonesimulator-arm64", "libLive2DCubismCore.a"),
             File.join(lib, "Release-iphonesimulator-x86_64", "libLive2DCubismCore.a"),
             "-output", simulator_lib)
    run.call("xcodebuild", "-create-xcframework",
             "-library", File.join(lib, "Release-iphoneos", "libLive2DCubismCore.a"),
             "-headers", File.join(core, "include"),
             "-library", simulator_lib, "-headers", File.join(core, "include"),
             "-output", File.join(cubism_stage_dir, "Live2DCubismCore.xcframework"))
  end
  File.write(cubism_stamp_path, cubism_stamp)
  Pod::UI.puts "[rn-live2d] Using Cubism SDK for Native #{cubism_version} from #{cubism_sdk_dir}"
end

# Draw in C++ onto react-native-skia canvases (cpp/SkiaDrawer.cpp). Skia is
# linked statically into the app by the react-native-skia pod, so this only needs
# its headers and the defines it's built with. Without it, models are drawn in JS.
rn_skia_dir = Dir.chdir(__dir__) do
  `node -e "process.stdout.write(require('path').dirname(require.resolve('react-native-skia/package.json')))" 2>/dev/null`.strip
end
rn_skia_dir = nil if rn_skia_dir.empty? || !File.file?(File.join(rn_skia_dir, "cpp", "api", "JsiSkCanvas.h"))

Pod::Spec.new do |s|
  s.name         = "RnLive2d"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/airisu-dev/experiment-rn-live2d.git", :tag => "#{s.version}" }

  s.source_files = [
    # Implementation (Swift)
    "ios/**/*.{swift}",
    # Autolinking/Registration (Objective-C++)
    "ios/**/*.{m,mm}",
    # Implementation (C++ objects)
    "cpp/**/*.{hpp,cpp}",
    # Cubism Native Framework (motions, physics, pose, ...)
    "cubism-sdk/Framework/**/*.{hpp,cpp}",
  ]
  # Its Rendering/<backend> folders are left out: we draw with Skia
  # (see cpp/CubismRendererStub.cpp).
  s.exclude_files = "cubism-sdk/Framework/Rendering/*/**/*"

  s.vendored_frameworks = "cubism-sdk/Live2DCubismCore.xcframework"
  # Set before add_nitrogen_files, which merges its own settings into this.
  header_search_paths = [
    "\"$(PODS_TARGET_SRCROOT)/cubism-sdk/Core/include\"",
    "\"$(PODS_TARGET_SRCROOT)/cubism-sdk/Framework\"",
  ]
  preprocessor_definitions = ["$(inherited)"]
  if rn_skia_dir
    Pod::UI.puts "[RnLive2d] Drawing with Skia in C++ (#{rn_skia_dir})"
    s.dependency "react-native-skia"
    header_search_paths += ["cpp", "cpp/skia", "cpp/dawn/include", "cpp/api", "cpp/jsi",
                            "cpp/rnskia", "cpp/rnskia/values", "cpp/utils"]
      .map { |dir| "\"#{File.join(rn_skia_dir, dir)}\"" }
    # Same as the react-native-skia pod: struct layouts must match.
    preprocessor_definitions += ["RN_LIVE2D_SKIA=1", "SK_GRAPHITE=1",
                                 "SK_IMAGE_READ_PIXELS_DISABLE_LEGACY_API=1",
                                 "SK_DISABLE_LEGACY_SHAPER_FACTORY=1"]
  else
    Pod::UI.puts "[RnLive2d] react-native-skia not found, drawing in JS"
  end
  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => header_search_paths.join(" "),
    "GCC_PREPROCESSOR_DEFINITIONS" => preprocessor_definitions.join(" "),
  }

  load 'nitrogen/generated/ios/RnLive2d+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  install_modules_dependencies(s)
end

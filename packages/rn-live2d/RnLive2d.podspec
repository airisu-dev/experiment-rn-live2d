require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# Cubism Core is proprietary and user-supplied (see docs/gotchas.md#licensing).
# scripts/fetch-cubism-sdk.sh downloads the SDK and builds the xcframework on macOS.
cubism_core_dir = File.join(__dir__, "vendor", "CubismSdkForNative", "Core")
unless File.directory?(File.join(cubism_core_dir, "Live2DCubismCore.xcframework"))
  raise "[RnLive2d] Cubism Core xcframework not found in #{cubism_core_dir}. " \
        "Run `bun run fetch:cubism` on macOS first."
end

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
  ]

  s.vendored_frameworks = "vendor/CubismSdkForNative/Core/Live2DCubismCore.xcframework"
  # Set before add_nitrogen_files, which merges its own settings into this.
  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => "\"$(PODS_TARGET_SRCROOT)/vendor/CubismSdkForNative/Core/include\"",
  }

  load 'nitrogen/generated/ios/RnLive2d+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  install_modules_dependencies(s)
end

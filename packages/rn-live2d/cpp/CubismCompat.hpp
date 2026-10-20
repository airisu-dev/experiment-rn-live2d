#pragma once

// Differences between the Cubism SDK for Native versions rn-live2d builds
// against (cubismSdk.versions in package.json). build.gradle and the podspec
// pass the SDK's version as RN_LIVE2D_CUBISM_SDK: major * 10000 + release *
// 100 + patch, so 5-r.4.1 is 50401. Version-specific calls go here, behind
// #if on it (see docs/plan/milestone-06.md).

#include "Live2DCubismCore.hpp"

#ifndef RN_LIVE2D_CUBISM_SDK
#error "[rn-live2d] RN_LIVE2D_CUBISM_SDK isn't set: build through Gradle or CocoaPods."
#endif

#if RN_LIVE2D_CUBISM_SDK < 50500
#error "[rn-live2d] Cubism SDK for Native before 5-r.5 isn't supported."
#endif

namespace margelo::nitro::rnlive2d::cubism {

// Drawable render orders. Named csmGetDrawableRenderOrders before 5-r.5.
inline const int* renderOrders(const Live2D::Cubism::Core::csmModel* model) {
    return Live2D::Cubism::Core::csmGetRenderOrders(model);
}

} // namespace margelo::nitro::rnlive2d::cubism

#include <jni.h>
#include <fbjni/fbjni.h>
#include "RnLive2dOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, []() {
    margelo::nitro::rnlive2d::registerAllNatives();
  });
}
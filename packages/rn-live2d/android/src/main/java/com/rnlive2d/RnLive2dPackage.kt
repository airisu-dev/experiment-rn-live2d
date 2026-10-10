package com.rnlive2d;

import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import com.facebook.react.BaseReactPackage;
import com.margelo.nitro.rnlive2d.RnLive2dOnLoad;


public class RnLive2dPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider { emptyMap() }

  companion object {
    init {
      RnLive2dOnLoad.initializeNative();
    }
  }
}

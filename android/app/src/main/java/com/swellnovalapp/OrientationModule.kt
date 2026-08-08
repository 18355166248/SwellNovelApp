package com.swellnovalapp

import android.content.pm.ActivityInfo
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 阅读页手动锁定横/竖屏。使用固定方向而非 sensor 方向，保证设备转动时界面不会跟随。
 */
class OrientationModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "Orientation"

  @ReactMethod
  fun lockTo(orientation: String) {
    val activity = reactApplicationContext.currentActivity ?: return
    val requested = if (orientation == "landscape") {
      ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
    } else {
      ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    }
    activity.runOnUiThread {
      activity.requestedOrientation = requested
    }
  }
}

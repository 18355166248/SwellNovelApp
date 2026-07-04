package com.swellnovalapp

import android.provider.Settings
import android.view.WindowManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 通过当前 Activity 窗口的 screenBrightness 调整应用内屏幕亮度（0..1）。
 * 应用窗口级，无需 WRITE_SETTINGS 权限；离开应用自动恢复系统亮度。
 */
class BrightnessModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "Brightness"

  @ReactMethod
  fun setBrightness(value: Double) {
    val activity = currentActivity ?: return
    val level = value.coerceIn(0.0, 1.0).toFloat()
    activity.runOnUiThread {
      val window = activity.window ?: return@runOnUiThread
      val params = window.attributes
      params.screenBrightness = level
      window.attributes = params
    }
  }

  @ReactMethod
  fun getBrightness(promise: Promise) {
    try {
      val activity = currentActivity
      val windowLevel = activity?.window?.attributes?.screenBrightness ?: -1f
      if (windowLevel >= 0f) {
        promise.resolve(windowLevel.toDouble())
        return
      }
      // 窗口未覆盖亮度时，读系统亮度（0..255 归一化到 0..1）。
      val sys = Settings.System.getInt(
        reactApplicationContext.contentResolver,
        Settings.System.SCREEN_BRIGHTNESS,
        128,
      )
      promise.resolve((sys / 255.0).coerceIn(0.0, 1.0))
    } catch (e: Exception) {
      promise.resolve(0.5)
    }
  }
}

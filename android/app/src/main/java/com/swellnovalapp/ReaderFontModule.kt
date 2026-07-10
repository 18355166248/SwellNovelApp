package com.swellnovalapp

import android.graphics.Typeface
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.common.assets.ReactFontManager

/** 将下载到本地的字体注册进 React Native 字体缓存。 */
class ReaderFontModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ReaderFontLoader"

  @ReactMethod
  fun registerFont(path: String, family: String, promise: Promise) {
    try {
      val typeface = Typeface.createFromFile(path)
      ReactFontManager.getInstance().addCustomFont(family, typeface)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("font_register_failed", "字体文件注册失败", error)
    }
  }
}

import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  // 默认及非阅读页面只允许竖屏；阅读页通过原生桥显式改成单一横屏或竖屏方向。
  @objc var orientationMask: UIInterfaceOrientationMask = .portrait

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
#if !DEBUG
    // RN 0.83.1 可能在本地 Bundle 已加载后仍残留 Metro 提示；正式包主动关闭，
    // 避免开发状态覆盖阅读页面，Debug 包继续保留加载反馈。
    RCTDevLoadingViewSetEnabled(false)
#endif

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "SwellNovalApp",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  func application(
    _ application: UIApplication,
    supportedInterfaceOrientationsFor window: UIWindow?
  ) -> UIInterfaceOrientationMask {
    orientationMask
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    let bundleURLProvider = RCTBundleURLProvider.sharedSettings()
#if targetEnvironment(simulator)
    // 本项目 Metro 固定使用 8082；模拟器若回落到默认 8081，可能误连其他 RN 项目并加载不匹配的 Bundle。
    bundleURLProvider.jsLocation = "localhost:8082"
#endif
    // 真机不能写死 localhost：继续读取 Dev Settings，调试时可配置电脑 IP:8082。
    return bundleURLProvider.jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

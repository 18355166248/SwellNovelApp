#import "Orientation.h"
#import <UIKit/UIKit.h>

@implementation Orientation

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup { return NO; }

RCT_EXPORT_METHOD(lockTo:(NSString *)orientation)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    BOOL landscape = [orientation isEqualToString:@"landscape"];
    UIInterfaceOrientationMask mask = landscape
      ? UIInterfaceOrientationMaskLandscapeRight
      : UIInterfaceOrientationMaskPortrait;
    UIInterfaceOrientation target = landscape
      ? UIInterfaceOrientationLandscapeRight
      : UIInterfaceOrientationPortrait;

    // AppDelegate 持有当前唯一允许方向；这样旋转完成后，传感器变化也不会再次带动界面。
    id delegate = UIApplication.sharedApplication.delegate;
    [delegate setValue:@(mask) forKey:@"orientationMask"];

    UIWindow *window = nil;
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
      if (scene.activationState != UISceneActivationStateUnattached &&
          [scene isKindOfClass:UIWindowScene.class]) {
        UIWindowScene *windowScene = (UIWindowScene *)scene;
        window = windowScene.windows.firstObject;
        if (@available(iOS 16.0, *)) {
          [window.rootViewController setNeedsUpdateOfSupportedInterfaceOrientations];
          UIWindowSceneGeometryPreferencesIOS *preferences =
            [[UIWindowSceneGeometryPreferencesIOS alloc] initWithInterfaceOrientations:mask];
          [windowScene requestGeometryUpdateWithPreferences:preferences
                                                errorHandler:^(NSError *error) {
            NSLog(@"[Orientation] geometry update failed: %@", error.localizedDescription);
          }];
        }
        break;
      }
    }

    if (@available(iOS 16.0, *)) {
      [UIViewController attemptRotationToDeviceOrientation];
    } else {
      // 旧系统没有 scene geometry API，只能通过设备方向触发一次受控旋转。
      [[UIDevice currentDevice] setValue:@(target) forKey:@"orientation"];
      [UIViewController attemptRotationToDeviceOrientation];
    }
  });
}

@end

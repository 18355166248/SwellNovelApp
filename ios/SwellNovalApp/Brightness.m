#import "Brightness.h"
#import <UIKit/UIKit.h>

// 通过 UIScreen.brightness 调整设备屏幕亮度（0..1）。
@implementation Brightness

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup { return NO; }

RCT_EXPORT_METHOD(setBrightness:(nonnull NSNumber *)value)
{
  CGFloat level = MAX(0.0, MIN(1.0, value.doubleValue));
  dispatch_async(dispatch_get_main_queue(), ^{
    [UIScreen mainScreen].brightness = level;
  });
}

RCT_EXPORT_METHOD(getBrightness:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    resolve(@([UIScreen mainScreen].brightness));
  });
}

@end

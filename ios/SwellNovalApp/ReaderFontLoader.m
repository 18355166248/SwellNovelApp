#import "ReaderFontLoader.h"
#import <CoreText/CoreText.h>

@implementation ReaderFontLoader

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup { return NO; }

RCT_REMAP_METHOD(registerFont,
                 registerFontAtPath:(NSString *)path
                 family:(NSString *)family
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSURL *url = [NSURL fileURLWithPath:path];
    CFErrorRef error = NULL;
    BOOL registered = CTFontManagerRegisterFontsForURL(
      (__bridge CFURLRef)url,
      kCTFontManagerScopeProcess,
      &error
    );

    // 同一字体在本进程中重复注册是可恢复状态；其余错误必须回传 JS，
    // 由阅读器保留当前字体，避免把不可用 family 写入持久化设置。
    if (!registered && error != NULL) {
      CFIndex code = CFErrorGetCode(error);
      if (code != kCTFontManagerErrorAlreadyRegistered) {
        NSError *fontError = CFBridgingRelease(error);
        reject(@"font_register_failed", fontError.localizedDescription, fontError);
        return;
      }
      CFRelease(error);
    }

    resolve(nil);
  });
}

@end

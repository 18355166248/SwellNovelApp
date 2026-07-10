import AppKit
import CoreGraphics
import ImageIO

let args = Array(CommandLine.arguments.dropFirst())
let input = args.first ?? "assets/app-icon-source.png"
let output = args.dropFirst().first
  ?? "ios/SwellNovalApp/Images.xcassets/AppIcon.appiconset/AppIcon-1024.png"
let size = 1024

guard let source = NSImage(contentsOfFile: input) else {
  fatalError("无法读取图标源文件: \(input)")
}

let targetRect = CGRect(x: 0, y: 0, width: size, height: size)
var sourceRect = CGRect(origin: .zero, size: source.size)
guard let sourceImage = source.cgImage(forProposedRect: &sourceRect, context: nil, hints: nil) else {
  fatalError("无法解析图标源文件: \(input)")
}

// AppIcon 必须是不带透明通道的正方形；源图保持满版，圆角由系统统一裁切。
let colorSpace = CGColorSpaceCreateDeviceRGB()
guard let context = CGContext(
  data: nil,
  width: size,
  height: size,
  bitsPerComponent: 8,
  bytesPerRow: size * 4,
  space: colorSpace,
  bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.noneSkipLast.rawValue
) else {
  fatalError("无法创建图标画布")
}

context.interpolationQuality = .high
context.draw(sourceImage, in: targetRect)
guard let result = context.makeImage() else {
  fatalError("无法生成图标")
}

try FileManager.default.createDirectory(
  atPath: (output as NSString).deletingLastPathComponent,
  withIntermediateDirectories: true
)
guard let destination = CGImageDestinationCreateWithURL(
  URL(fileURLWithPath: output) as CFURL,
  "public.png" as CFString,
  1,
  nil
) else {
  fatalError("无法创建输出文件: \(output)")
}
CGImageDestinationAddImage(destination, result, nil)
guard CGImageDestinationFinalize(destination) else {
  fatalError("无法写入输出文件: \(output)")
}

import AppKit
import CoreGraphics
import ImageIO

let output = CommandLine.arguments.dropFirst().first ?? "ios/SwellNovalApp/Images.xcassets/AppIcon.appiconset/AppIcon-1024.png"
let size = 1024
let rect = CGRect(x: 0, y: 0, width: size, height: size)

func color(_ hex: UInt32) -> NSColor {
  NSColor(
    calibratedRed: CGFloat((hex >> 16) & 0xff) / 255.0,
    green: CGFloat((hex >> 8) & 0xff) / 255.0,
    blue: CGFloat(hex & 0xff) / 255.0,
    alpha: 1
  )
}

let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()

let ctx = NSGraphicsContext.current!.cgContext
ctx.setShouldAntialias(true)
ctx.setAllowsAntialiasing(true)

// AppIcon 资源必须是无透明通道的正方形，iOS 会在桌面展示时自动裁圆角；
// 主体留足边距，避免书页和中文被系统圆角裁掉。
let bg = NSBezierPath(rect: rect)
color(0x123F36).setFill()
bg.fill()

let halo = NSBezierPath(ovalIn: CGRect(x: 146, y: 118, width: 732, height: 732))
color(0x1F7666).withAlphaComponent(0.32).setFill()
halo.fill()

let bookShadow = NSBezierPath(roundedRect: CGRect(x: 232, y: 302, width: 560, height: 360), xRadius: 42, yRadius: 42)
color(0x092A25).withAlphaComponent(0.22).setFill()
bookShadow.fill()

let leftPage = NSBezierPath()
leftPage.move(to: CGPoint(x: 238, y: 330))
leftPage.curve(to: CGPoint(x: 508, y: 284), controlPoint1: CGPoint(x: 318, y: 292), controlPoint2: CGPoint(x: 420, y: 278))
leftPage.line(to: CGPoint(x: 508, y: 638))
leftPage.curve(to: CGPoint(x: 238, y: 678), controlPoint1: CGPoint(x: 420, y: 662), controlPoint2: CGPoint(x: 318, y: 684))
leftPage.close()
color(0xF6EDDC).setFill()
leftPage.fill()

let rightPage = NSBezierPath()
rightPage.move(to: CGPoint(x: 516, y: 284))
rightPage.curve(to: CGPoint(x: 786, y: 330), controlPoint1: CGPoint(x: 604, y: 278), controlPoint2: CGPoint(x: 706, y: 292))
rightPage.line(to: CGPoint(x: 786, y: 678))
rightPage.curve(to: CGPoint(x: 516, y: 638), controlPoint1: CGPoint(x: 706, y: 684), controlPoint2: CGPoint(x: 604, y: 662))
rightPage.close()
color(0xFFF8EA).setFill()
rightPage.fill()

color(0xD7C6A5).setStroke()
for i in 0..<3 {
  let y = 398 + i * 72
  let line = NSBezierPath()
  line.lineWidth = 18
  line.lineCapStyle = .round
  line.move(to: CGPoint(x: 590, y: y))
  line.curve(to: CGPoint(x: 724, y: y + 18), controlPoint1: CGPoint(x: 636, y: y + 6), controlPoint2: CGPoint(x: 684, y: y + 14))
  line.stroke()
}

let fold = NSBezierPath()
fold.lineWidth = 16
fold.lineCapStyle = .round
color(0x2A7568).setStroke()
fold.move(to: CGPoint(x: 512, y: 302))
fold.line(to: CGPoint(x: 512, y: 652))
fold.stroke()

let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center
let font = NSFont(name: "PingFangSC-Semibold", size: 214) ?? NSFont.systemFont(ofSize: 214, weight: .semibold)
let attrs: [NSAttributedString.Key: Any] = [
  .font: font,
  .foregroundColor: color(0x123F36),
  .paragraphStyle: paragraph,
]
"卷".draw(in: CGRect(x: 0, y: 406, width: size, height: 260), withAttributes: attrs)

image.unlockFocus()

try FileManager.default.createDirectory(
  atPath: (output as NSString).deletingLastPathComponent,
  withIntermediateDirectories: true
)

var proposed = rect
guard let sourceImage = image.cgImage(forProposedRect: &proposed, context: nil, hints: nil) else {
  fatalError("Failed to create source CGImage")
}
let colorSpace = CGColorSpaceCreateDeviceRGB()
guard
  let rgbContext = CGContext(
    data: nil,
    width: size,
    height: size,
    bitsPerComponent: 8,
    bytesPerRow: size * 4,
    space: colorSpace,
    bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.noneSkipLast.rawValue
  )
else {
  fatalError("Failed to create RGB CGContext")
}
rgbContext.draw(sourceImage, in: rect)
guard let rgbImage = rgbContext.makeImage() else {
  fatalError("Failed to create RGB CGImage")
}
let url = URL(fileURLWithPath: output) as CFURL
guard let destination = CGImageDestinationCreateWithURL(url, "public.png" as CFString, 1, nil) else {
  fatalError("Failed to create PNG destination")
}
CGImageDestinationAddImage(destination, rgbImage, nil)
if !CGImageDestinationFinalize(destination) {
  fatalError("Failed to write PNG")
}

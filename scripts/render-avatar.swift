import AppKit

// Code-drawn avatar. Coordinates use a 512-point square with a bottom-left origin.
let outputPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "output/avatar"
let directory = URL(fileURLWithPath: outputPath, isDirectory: true)
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
let dark = NSColor(srgbRed: 32.0/255, green: 43.0/255, blue: 39.0/255, alpha: 1)
let lime = NSColor(srgbRed: 217.0/255, green: 241.0/255, blue: 138.0/255, alpha: 1)
let ivory = NSColor(srgbRed: 248.0/255, green: 249.0/255, blue: 241.0/255, alpha: 1)
func centered(_ string: String, font: NSFont, color: NSColor, centerY: CGFloat) {
    let text = NSAttributedString(string: string, attributes: [.font: font, .foregroundColor: color])
    let line = CTLineCreateWithAttributedString(text)
    let bounds = CTLineGetBoundsWithOptions(line, .useGlyphPathBounds)
    let context = NSGraphicsContext.current!.cgContext
    context.textPosition = CGPoint(x: 256 - bounds.midX, y: centerY - bounds.midY)
    CTLineDraw(line, context)
}
for size in [1024, 144] {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    let graphics = NSGraphicsContext(bitmapImageRep: bitmap)!
    NSGraphicsContext.current = graphics
    graphics.cgContext.scaleBy(x: CGFloat(size)/512, y: CGFloat(size)/512)
    dark.setFill()
    NSRect(x: 0, y: 0, width: 512, height: 512).fill()
    lime.setFill()
    NSBezierPath(roundedRect: NSRect(x: 119, y: 245, width: 274, height: 170), xRadius: 49, yRadius: 49).fill()
    let tail = NSBezierPath()
    tail.move(to: NSPoint(x: 164, y: 263))
    tail.line(to: NSPoint(x: 151, y: 218))
    tail.line(to: NSPoint(x: 216, y: 251))
    tail.close()
    tail.fill()
    centered("AI", font: NSFont.systemFont(ofSize: 125, weight: .heavy), color: dark, centerY: 330)
    centered("投了么", font: NSFont(name: "PingFangSC-Semibold", size: 105) ?? NSFont.systemFont(ofSize: 105, weight: .semibold), color: ivory, centerY: 154)
    NSGraphicsContext.restoreGraphicsState()
    let url = directory.appendingPathComponent("ai-toulema-\(size).png")
    try bitmap.representation(using: .png, properties: [:])!.write(to: url)
    print("\(url.path): \(try Data(contentsOf: url).count) bytes")
}

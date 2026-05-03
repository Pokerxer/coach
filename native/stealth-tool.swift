import Cocoa
import Foundation

// Private CGS APIs
@_silgen_name("CGSMainConnectionID")
func CGSMainConnectionID() -> Int32

@_silgen_name("CGSSetWindowCaptureExcludeShape")
func CGSSetWindowCaptureExcludeShape(_ cid: Int32, _ wid: Int32, _ region: CGRegion) -> Int32

@_silgen_name("CGSRemoveWindowCaptureExcludeShape")
func CGSRemoveWindowCaptureExcludeShape(_ cid: Int32, _ wid: Int32) -> Int32

@_silgen_name("CGSWindowGetNumber")
func CGSWindowGetNumber(_ cid: Int32, _ window: NSWindow?) -> Int32

func setWindowCaptureExclude(windowNumber: Int32) -> Bool {
    let cid = CGSMainConnectionID()
    
    // Get window info
    guard let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
        print("[stealth] Failed to get window list")
        return false
    }
    
    var windowBounds = CGRect.zero
    for window in windowList {
        guard let wNum = window[kCGWindowNumber as String] as? Int32,
              wNum == windowNumber,
              let boundsDict = window[kCGWindowBounds as String] as? [String: Any] else {
            continue
        }
        
        if let x = boundsDict["X"] as? CGFloat,
           let y = boundsDict["Y"] as? CGFloat,
           let w = boundsDict["Width"] as? CGFloat,
           let h = boundsDict["Height"] as? CGFloat {
            windowBounds = CGRect(x: x, y: y, width: w, height: h)
            break
        }
    }
    
    if windowBounds == .zero {
        print("[stealth] Could not find window bounds for \(windowNumber)")
        return false
    }
    
    let region = CGRegion(rect: windowBounds)
    let result = CGSSetWindowCaptureExcludeShape(cid, windowNumber, region)
    
    if result == 0 {
        print("[stealth] Successfully excluded window \(windowNumber) from capture")
        return true
    } else {
        print("[stealth] Failed to exclude window: \(result)")
        return false
    }
}

func removeWindowCaptureExclude(windowNumber: Int32) -> Bool {
    let cid = CGSMainConnectionID()
    let result = CGSRemoveWindowCaptureExcludeShape(cid, windowNumber)
    return result == 0
}

// CLI Interface
let args = CommandLine.arguments

if args.count < 3 {
    print("Usage: stealth-tool <window-number> <exclude|include>")
    exit(1)
}

guard let windowNumber = Int32(args[1]) else {
    print("Invalid window number")
    exit(1)
}

let command = args[2]

switch command {
case "exclude":
    let success = setWindowCaptureExclude(windowNumber: windowNumber)
    exit(success ? 0 : 1)
case "include":
    let success = removeWindowCaptureExclude(windowNumber: windowNumber)
    exit(success ? 0 : 1)
default:
    print("Unknown command: \(command)")
    exit(1)
}
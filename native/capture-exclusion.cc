#include <napi.h>
#include <ApplicationServices/ApplicationServices.h>
#include <CoreGraphics/CoreGraphics.h>
#include <mach/mach.h>

namespace capture_exclusion {

// Private CGS APIs for macOS capture exclusion
// These are undocmented but work on macOS 12-14
extern "C" {
  typedef int CGSConnectionID;
  typedef int CGSWindowID;
  typedef int CGError;
  
  CGSConnectionID CGSMainConnectionID(void);
  CGError CGSSetWindowCaptureExcludeShape(CGSConnectionID cid, CGSWindowID wid, CGRegionRef region);
  CGError CGSRemoveWindowCaptureExcludeShape(CGSConnectionID cid, CGSWindowID wid);
  CGSWindowID CGSWindowGetNumber(CGSConnectionID cid, void* nsWindow);
  void* CGSWindowGetRef(CGSConnectionID cid, CGSWindowID wid);
}

// Helper to get macOS version
int getMacOSVersion() {
  NSAutoreleasePool* pool = [[NSAutoreleasePool alloc] init];
  NSProcessInfo* info = [NSProcessInfo processInfo];
  NSOperatingSystemVersion version = [info operatingSystemVersion];
  int major = version.majorVersion;
  [pool drain];
  return major;
}

Napi::Boolean SetWindowCaptureExclude(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  // Check macOS version - this only works on macOS 12-14
  int macOSVersion = getMacOSVersion();
  if (macOSVersion >= 15) {
    printf("[capture-exclusion] macOS %d detected - CGS API may not work\n", macOSVersion);
  }
  
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Window handle required").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }
  
  // Get window handle from Electron - it's a pointer value
  int64_t handle = info[0].As<Napi::Number>().Int64Value();
  void* nsWindow = reinterpret_cast<void*>(handle);
  
  if (!nsWindow) {
    printf("[capture-exclusion] Invalid window handle\n");
    return Napi::Boolean::New(env, false);
  }
  
  // Get the CGS window number from the NSWindow
  CGSConnectionID connection = CGSMainConnectionID();
  CGSWindowID wid = CGSWindowGetNumber(connection, nsWindow);
  
  if (wid == 0) {
    printf("[capture-exclusion] Could not get window ID\n");
    return Napi::Boolean::New(env, false);
  }
  
  // Get window bounds to create region
  CGRect bounds;
  CGRectZero(&bounds);
  
  // We need to get the bounds another way - use CGWindowListCopyWindowInfo
  CFArrayRef windowList = CGWindowListCopyWindowInfo(
    kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
    kCGNullWindowID
  );
  
  if (windowList) {
    CFIndex count = CFArrayGetCount(windowList);
    for (CFIndex i = 0; i < count; i++) {
      CFDictionaryRef window = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);
      CFNumberRef windowNum = (CFNumberRef)CFDictionaryGetValue(window, CFSTR("kCGWindowNumber"));
      if (windowNum) {
        int wNum = 0;
        CFNumberGetValue(windowNum, kCFNumberIntType, &wNum);
        if (wNum == wid) {
          // Found our window, get bounds
          CFDictionaryRef boundsDict = (CFDictionaryRef)CFDictionaryGetValue(window, CFSTR("kCGWindowBounds"));
          if (boundsDict) {
            CGRectMakeWithDictionaryRepresentation(boundsDict, &bounds);
          }
          break;
        }
      }
    }
    CFRelease(windowList);
  }
  
  if (CGRectIsEmpty(&bounds)) {
    printf("[capture-exclusion] Could not get window bounds\n");
    return Napi::Boolean::New(env, false);
  }
  
  // Create region covering entire window
  CGRegionRef region = CGRegionCreateWithRect(bounds);
  
  // Set exclude shape - punches hole in screen capture
  CGError result = CGSSetWindowCaptureExcludeShape(connection, wid, region);
  CGRegionRelease(region);
  
  printf("[capture-exclusion] Set exclude for window %d: result=%d\n", wid, result);
  
  return Napi::Boolean::New(env, result == 0);  // 0 = kCGErrorSuccess
}

Napi::Boolean RemoveWindowCaptureExclude(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Window handle required").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }
  
  int64_t handle = info[0].As<Napi::Number>().Int64Value();
  void* nsWindow = reinterpret_cast<void*>(handle);
  
  CGSConnectionID connection = CGSMainConnectionID();
  CGSWindowID wid = CGSWindowGetNumber(connection, nsWindow);
  
  if (wid == 0) {
    return Napi::Boolean::New(env, false);
  }
  
  CGError result = CGSRemoveWindowCaptureExcludeShape(connection, wid);
  
  printf("[capture-exclusion] Removed exclude for window %d: result=%d\n", wid, result);
  
  return Napi::Boolean::New(env, result == 0);
}

Napi::Object GetMacOSVersion(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object result = Napi::Object::New(env);
  
  int version = getMacOSVersion();
  result.Set(Napi::String::New(env, "major"), Napi::Number::New(env, version));
  result.Set(Napi::String::New(env, "description"),
    Napi::String::New(env, version >= 15 ? "macOS 15+ - CGS API limited" : "CGS API should work"));
  
  return result;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "setWindowCaptureExclude"),
              Napi::Function::New(env, SetWindowCaptureExclude));
  exports.Set(Napi::String::New(env, "removeWindowCaptureExclude"),
              Napi::Function::New(env, RemoveWindowCaptureExclude));
  exports.Set(Napi::String::New(env, "getMacOSVersion"),
              Napi::Function::New(env, GetMacOSVersion));
  
  return exports;
}

}

NODE_API_MODULE(capture_exclusion, capture_exclusion::Init)
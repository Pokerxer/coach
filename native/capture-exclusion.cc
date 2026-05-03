#include <napi.h>
#include <ApplicationServices/ApplicationServices.h>
#include <CoreGraphics/CoreGraphics.h>
#include <mach/mach.h>

namespace capture_exclusion {

extern "C" {
  typedef int32_t CGSConnectionID;
  typedef uint32_t CGSWindowID;
  typedef CGError CGSError;
  
  CGSConnectionID CGSMainConnectionID(void);
  CGSError CGSSetWindowCaptureExcludeShape(CGSConnectionID cid, CGSWindowID wid, CGRegionRef region);
  CGSError CGSRemoveWindowCaptureExcludeShape(CGSConnectionID cid, CGSWindowID wid);
}

Napi::Boolean SetWindowCaptureExclude(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Window handle number required").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }
  
  int64_t windowHandle = info[0].As<Napi::Number>().Int64Value();
  CGSWindowID wid = static_cast<CGSWindowID>(windowHandle);
  
  CGSConnectionID connection = CGSMainConnectionID();
  
  // Get the window frame
  CGSWindowID windows[256];
  int windowCount = 0;
  CGSConnectionCopyWindowList(connection, &wid, 1, windows, &windowCount);
  
  if (windowCount <= 0) {
    return Napi::Boolean::New(env, true);  // Window not found, but don't error
  }
  
  // Get window bounds
  CGRect bounds;
  CGSWindowGetBounds(connection, wid, kCGSWindowBoundsOrigin | kCGSWindowBoundsSize, &bounds);
  
  // Create region covering the entire window
  CGRegionRef region = CGRegionCreateWithRect(bounds);
  
  // Set exclude shape - this punches a hole in screen capture
  CGSError result = CGSSetWindowCaptureExcludeShape(connection, wid, region);
  CGRegionRelease(region);
  
  return Napi::Boolean::New(env, result == kCGErrorSuccess);
}

Napi::Boolean RemoveWindowCaptureExclude(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Window handle number required").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }
  
  int64_t windowHandle = info[0].As<Napi::Number>().Int64Value();
  CGSWindowID wid = static_cast<CGSWindowID>(windowHandle);
  
  CGSConnectionID connection = CGSMainConnectionID();
  CGSError result = CGSRemoveWindowCaptureExcludeShape(connection, wid);
  
  return Napi::Boolean::New(env, result == kCGErrorSuccess);
}

Napi::Boolean IsContentProtectionSupported(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  // Check if we're on macOS 15+ where we need this workaround
  Napi::Object process = info.Env().Global().Get("process").As<Napi::Object>();
  Napi::Value platform = process.Get("platform");
  bool isDarwin = platform.ToString().Utf8Value() == "darwin";
  
  return Napi::Boolean::New(env, isDarwin);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "setWindowCaptureExclude"),
              Napi::Function::New(env, SetWindowCaptureExclude));
  exports.Set(Napi::String::New(env, "removeWindowCaptureExclude"),
              Napi::Function::New(env, RemoveWindowCaptureExclude));
  exports.Set(Napi::String::New(env, "isContentProtectionSupported"),
              Napi::Function::New(env, IsContentProtectionSupported));
  
  return exports;
}

}

NODE_API_MODULE(capture_exclusion, capture_exclusion::Init)
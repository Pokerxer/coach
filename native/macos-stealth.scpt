#!/usr/bin/env osascript -l JavaScript

// This script uses AppleScript to invoke private CGS APIs
// Run with: osascript -l JavaScript native/macos-stealth.scpt

var app = Application.currentApplication();
app.includeStandardAdditions = true;

// Get the window we want to protect (the overlay window by window title)
var windows = [];
var win = null;

try {
  // Try to find windows with "float" or "overlay" in their name
  var allApps = Application.systemAttributes();
  
  // Use System Events to access windows
  var se = Application('System Events');
  var processName = 'Parakeet'; // Your app name
  
  var appProcess = se.processes.byName(processName);
  if (appProcess.exists()) {
    var wins = appProcess.windows();
    for (var i = 0; i < wins.length; i++) {
      var w = wins[i];
      // Check if it's likely an overlay/float window
      if (w.title().indexOf('float') >= 0 || w.title().indexOf('overlay') >= 0 || 
          w.name().indexOf('float') >= 0 || w.name().indexOf('overlay') >= 0) {
        win = w;
        break;
      }
    }
  }
  
  if (win) {
    // Get the window number for CGS API
    var windowNumber = win.propertyByName('window number');
    // This would need to be passed to the CGS API from another tool
    console.log("Found window: " + win.title() + " (number: " + windowNumber + ")");
  } else {
    console.log("No overlay window found");
  }
} catch (e) {
  console.log("Error: " + e.message);
}
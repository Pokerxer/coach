// Parakeet AI - Background Service Worker
// Uses chrome.tabCapture API for tab audio capture

let activeStream = null;
let activeTabId = null;

async function captureTab(tabId) {
  await stopCapture();
  
  try {
    // Get the media stream from the tab
    const stream = await chrome.tabCapture.capture({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: tabId
        }
      },
      video: false
    });
    
    if (!stream || stream.getAudioTracks().length === 0) {
      return { success: false, error: 'No audio track available' };
    }
    
    activeStream = stream;
    activeTabId = tabId;
    stream.getAudioTracks()[0].onended = () => {
      stopCapture();
    };
    
    return { success: true };
  } catch (err) {
    console.error('Capture error:', err);
    return { success: false, error: err.message };
  }
}

async function stopCapture() {
  if (activeStream) {
    activeStream.getTracks().forEach(track => track.stop());
    activeStream = null;
  }
  activeTabId = null;
}

function getTabs() {
  return chrome.tabs.query({ 
    status: 'complete',
    windowType: 'normal'
  }).then(tabs => {
    return tabs.filter(tab => 
      tab.url && 
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('chrome-extension://') &&
      !tab.url.startsWith('devtools://') &&
      !tab.url.startsWith('file://') &&
      !tab.url.startsWith('about:')
    );
  });
}

function getStatus() {
  return {
    active: activeStream !== null,
    tabId: activeTabId
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    START_CAPTURE: async () => {
      const result = await captureTab(message.tabId);
      sendResponse(result);
    },
    STOP_CAPTURE: async () => {
      await stopCapture();
      sendResponse({ success: true });
    },
    GET_TABS: async () => {
      const tabs = await getTabs();
      sendResponse(tabs);
    },
    GET_STATUS: async () => {
      sendResponse(getStatus());
    }
  };
  
  if (handlers[message.type]) {
    handlers[message.type]();
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  if (tabId === activeTabId) {
    stopCapture();
    chrome.runtime.sendMessage({ type: 'CAPTURE_STOPPED' });
  }
});
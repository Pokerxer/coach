// Parakeet AI - Background Service Worker
// Handles tab audio capture and messaging

let activeStream = null;
let activeTabId = null;

async function captureTab(tabId) {
  await stopCapture();
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: tabId
        },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
    
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
    audible: true,
    status: 'complete'
  }).then(tabs => {
    return tabs.filter(tab => 
      tab.url && 
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('chrome-extension://') &&
      !tab.url.startsWith('devtools://') &&
      !tab.url.startsWith('file://')
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.audible === false && tabId === activeTabId) {
    stopCapture();
    chrome.runtime.sendMessage({ type: 'CAPTURE_STOPPED' });
  }
});
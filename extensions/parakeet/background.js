// Parakeet AI - Background Service Worker
// Captures audio from specific tab without screen sharing

let activeStream = null;
let activeTabId = null;
let audioContext = null;
let processor = null;

// Capture audio from selected tab
async function captureTab(tabId) {
  // Stop any existing capture
  await stopCapture();

  try {
    const constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: tabId,
        },
      },
      video: false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    activeStream = stream;
    activeTabId = tabId;

    // Set up audio processing
    setupAudioProcessing(stream);

    // Notify side panel
    chrome.runtime.sendMessage({
      type: 'CAPTURE_STARTED',
      tabId: tabId,
    });

    return { success: true };
  } catch (err) {
    console.error('Tab capture failed:', err);
    return { success: false, error: err.message };
  }
}

// Stop current capture
async function stopCapture() {
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
    activeStream = null;
  }
  if (processor) {
    processor.disconnect();
    processor = null;
  }
  if (audioContext) {
    await audioContext.close();
    audioContext = null;
  }
  activeTabId = null;

  chrome.runtime.sendMessage({ type: 'CAPTURE_STOPPED' });
}

// Set up Web Audio API for processing
function setupAudioProcessing(stream) {
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    
    // Calculate volume level for UI
    let sum = 0;
    for (let i = 0; i < inputData.length; i++) {
      sum += inputData[i] * inputData[i];
    }
    const rms = Math.sqrt(sum / inputData.length);
    
    // Send audio data to side panel
    chrome.runtime.sendMessage({
      type: 'AUDIO_DATA',
      rms: rms,
      data: Array.from(inputData.slice(0, 1024)),
    });
  };

  source.connect(processor);
  processor.connect(audioContext.destination);
}

// List available tabs for capture
async function getCapturableTabs() {
  try {
    const tabs = await chrome.tabs.query({ audible: true, pinned: false });
    return tabs.filter(tab => 
      tab.url && 
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('chrome-extension://') &&
      !tab.url.startsWith('devtools://')
    );
  } catch {
    return [];
  }
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_CAPTURE':
      captureTab(message.tabId).then(sendResponse);
      return true;
    case 'STOP_CAPTURE':
      stopCapture().then(() => sendResponse({ success: true }));
      return true;
    case 'GET_TABS':
      getCapturableTabs().then(sendResponse);
      return true;
    case 'GET_STATUS':
      sendResponse({
        active: activeStream !== null,
        tabId: activeTabId,
      });
      break;
  }
});

// Handle tab close to stop capture
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    stopCapture();
  }
});
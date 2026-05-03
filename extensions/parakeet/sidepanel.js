// Parakeet AI - Side Panel

let currentTabId = null;
let isCapturing = false;
let autoPaste = false;

// DOM elements
const captureBtn = document.getElementById('capture-btn');
const tabSelect = document.getElementById('tab-select');
const volumeBar = document.getElementById('volume-bar');
const statusEl = document.getElementById('status');
const answersList = document.getElementById('answers-list');
const autoPasteCheck = document.getElementById('auto-paste');

// Initialize
async function init() {
  await loadTabs();
  await loadSettings();
  
  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message) => {
    handleMessage(message);
  });
}

// Load available tabs
async function loadTabs() {
  try {
    const tabs = await chrome.runtime.sendMessage({ type: 'GET_TABS' });
    tabSelect.innerHTML = '<option value="">Select a tab...</option>';
    tabs.forEach((tab) => {
      const option = document.createElement('option');
      option.value = tab.id;
      option.textContent = `${tab.title.substring(0, 50)} (${new URL(tab.url).hostname})`;
      tabSelect.appendChild(option);
    });
  } catch (err) {
    console.error('Failed to load tabs:', err);
  }
}

// Load settings
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['autoPaste']);
    autoPaste = result.autoPaste ?? false;
    autoPasteCheck.checked = autoPaste;
  } catch {}
}

// Save settings
async function saveSettings() {
  try {
    await chrome.storage.local.set({ autoPaste });
  } catch {}
}

// Handle messages from background
function handleMessage(message) {
  switch (message.type) {
    case 'CAPTURE_STARTED':
      isCapturing = true;
      currentTabId = message.tabId;
      updateUI();
      break;
    case 'CAPTURE_STOPPED':
      isCapturing = false;
      currentTabId = null;
      updateUI();
      break;
    case 'AUDIO_DATA':
      updateVolume(message.rms);
      break;
  }
}

// Update UI state
function updateUI() {
  if (isCapturing) {
    captureBtn.textContent = 'Stop Capture';
    captureBtn.classList.add('recording');
    statusEl.textContent = 'Capturing...';
    statusEl.classList.add('active');
  } else {
    captureBtn.textContent = 'Start Capture';
    captureBtn.classList.remove('recording');
    statusEl.textContent = 'Ready';
    statusEl.classList.remove('active');
  }
}

// Update volume meter
function updateVolume(rms) {
  const percent = Math.min(100, rms * 2000);
  volumeBar.style.width = `${percent}%`;
  
  // Update color based on level
  if (percent > 70) {
    volumeBar.classList.add('high');
  } else if (percent > 30) {
    volumeBar.classList.remove('high');
  }
}

// Add answer to list
function addAnswer(text) {
  const empty = answersList.querySelector('.empty-state');
  if (empty) empty.remove();
  
  const answer = document.createElement('div');
  answer.className = 'answer-item';
  answer.textContent = text;
  answersList.prepend(answer);
  
  // Auto-paste if enabled
  if (autoPaste && currentTabId) {
    chrome.tabs.sendMessage(currentTabId, {
      type: 'PASTE_TEXT',
      text: text,
    });
  }
}

// Event listeners
captureBtn.addEventListener('click', async () => {
  if (isCapturing) {
    await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });
  } else {
    const tabId = parseInt(tabSelect.value);
    if (!tabId) {
      alert('Please select a tab first');
      return;
    }
    await chrome.runtime.sendMessage({ type: 'START_CAPTURE', tabId });
  }
});

tabSelect.addEventListener('change', async () => {
  const tabId = parseInt(tabSelect.value);
  if (tabId && !isCapturing) {
    currentTabId = tabId;
  }
});

autoPasteCheck.addEventListener('change', () => {
  autoPaste = autoPasteCheck.checked;
  saveSettings();
});

// Start
init();
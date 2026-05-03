// Parakeet AI - Side Panel (Full Functionality)

(function() {
  'use strict';

  // State
  let isCapturing = false;
  let currentTabId = null;
  let autoPaste = false;
  let clickthrough = false;
  let stealthMode = false;
  let transcript = [];
  let answers = [];
  let audioContext = null;
  let processor = null;

  // DOM Elements
  const $ = id => document.getElementById(id);
  const captureBtn = $('capture-btn');
  const tabSelect = $('tab-select');
  const refreshBtn = $('refresh-tabs');
  const statusEl = $('status');
  const volumeBar = $('volume-bar');
  const volumeValue = $('volume-value');
  const transcriptList = $('transcript-list');
  const answersList = $('answers-list');
  const autoPasteBtn = $('auto-paste-btn');
  const autoPasteToggle = $('auto-paste-toggle');
  const clickthroughBtn = $('clickthrough-btn');
  const clickthroughToggle = $('clickthrough-toggle');
  const stealthBtn = $('stealth-btn');
  const stealthToggle = $('stealth-toggle');
  const clearTranscriptBtn = $('clear-transcript');
  const modelBadge = $('model-badge');

  // Initialize
  async function init() {
    await loadSettings();
    await loadTabs();
    setupEventListeners();
    setupKeyboardShortcuts();
    startStatusPolling();
  }

  // Load tabs
  async function loadTabs() {
    try {
      const tabs = await chrome.runtime.sendMessage({ type: 'GET_TABS' });
      tabSelect.innerHTML = '<option value="">Select a tab...</option>';
      
      if (!tabs || tabs.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No tabs found - refresh page';
        tabSelect.appendChild(option);
        return;
      }
      
      tabs.forEach(tab => {
        const option = document.createElement('option');
        option.value = tab.id;
        try {
          const url = new URL(tab.url);
          option.textContent = `${tab.title?.substring(0, 35) || 'Untitled'} (${url.hostname})`;
        } catch {
          option.textContent = tab.title?.substring(0, 40) || 'Untitled';
        }
        tabSelect.appendChild(option);
      });
    } catch (err) {
      console.error('Failed to load tabs:', err);
    }
  }

  // Load settings from storage
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['autoPaste', 'clickthrough', 'stealthMode']);
      autoPaste = result.autoPaste || false;
      clickthrough = result.clickthrough || false;
      stealthMode = result.stealthMode || false;
      
      autoPasteToggle.textContent = autoPaste ? '●' : '○';
      clickthroughToggle.textContent = clickthrough ? '●' : '○';
      stealthToggle.textContent = stealthMode ? '●' : '○';
    } catch {}
  }

  // Save settings
  async function saveSettings() {
    try {
      await chrome.storage.local.set({ autoPaste, clickthrough, stealthMode });
    } catch {}
  }

  // Setup event listeners
  function setupEventListeners() {
    captureBtn.addEventListener('click', toggleCapture);
    tabSelect.addEventListener('change', onTabChange);
    refreshBtn.addEventListener('click', loadTabs);
    
    autoPasteBtn.addEventListener('click', () => {
      autoPaste = !autoPaste;
      autoPasteToggle.textContent = autoPaste ? '●' : '○';
      saveSettings();
    });

    clickthroughBtn.addEventListener('click', async () => {
      clickthrough = !clickthrough;
      clickthroughToggle.textContent = clickthrough ? '●' : '○';
      saveSettings();
      if (currentTabId) {
        await chrome.tabs.sendMessage(currentTabId, { 
          type: 'SET_CLICKTHROUGH', 
          enabled: clickthrough 
        });
      }
    });

    stealthBtn.addEventListener('click', async () => {
      stealthMode = !stealthMode;
      stealthToggle.textContent = stealthMode ? '●' : '○';
      saveSettings();
      if (currentTabId) {
        await chrome.tabs.sendMessage(currentTabId, { 
          type: 'SET_STEALTH', 
          enabled: stealthMode 
        });
      }
    });

    clearTranscriptBtn.addEventListener('click', () => {
      transcript = [];
      answers = [];
      renderTranscript();
      renderAnswers();
    });
  }

  // Keyboard shortcuts
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', async (e) => {
      if (e.altKey && e.key === 'p') {
        e.preventDefault();
        toggleCapture();
      }
    });
  }

  // Toggle capture
  async function toggleCapture() {
    if (isCapturing) {
      await stopCapture();
    } else {
      await startCapture();
    }
  }

  // Start capture
  async function startCapture() {
    const tabId = parseInt(tabSelect.value);
    if (!tabId) {
      statusEl.textContent = 'Select a tab first';
      statusEl.classList.add('error');
      return;
    }

    try {
      const result = await chrome.runtime.sendMessage({ 
        type: 'START_CAPTURE', 
        tabId 
      });

      if (result.success) {
        isCapturing = true;
        currentTabId = tabId;
        updateUI();
        statusEl.textContent = 'Capturing';
        statusEl.classList.remove('error');
        
        if (stealthMode && currentTabId) {
          await chrome.tabs.sendMessage(currentTabId, { 
            type: 'SET_STEALTH', 
            enabled: true 
          });
        }
      } else {
        statusEl.textContent = result.error || 'Failed';
        statusEl.classList.add('error');
      }
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.classList.add('error');
    }
  }

  // Stop capture
  async function stopCapture() {
    try {
      await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });
    } catch {}
    
    isCapturing = false;
    currentTabId = null;
    updateUI();
    statusEl.textContent = 'Ready';
  }

  // Tab change handler
  async function onTabChange() {
    const tabId = parseInt(tabSelect.value);
    if (tabId && isCapturing && tabId !== currentTabId) {
      await stopCapture();
      tabSelect.value = tabId;
      await startCapture();
    }
  }

  // Update UI
  function updateUI() {
    const btnText = captureBtn.querySelector('.btn-text');
    const btnIcon = captureBtn.querySelector('.btn-icon');
    
    if (isCapturing) {
      captureBtn.classList.add('recording');
      btnText.textContent = 'Stop Capture';
      btnIcon.textContent = '■';
      statusEl.classList.add('active');
      statusEl.textContent = 'Capturing...';
    } else {
      captureBtn.classList.remove('recording');
      btnText.textContent = 'Start Capture';
      btnIcon.textContent = '●';
      statusEl.classList.remove('active');
      statusEl.textContent = 'Ready';
    }

    tabSelect.disabled = isCapturing;
    refreshBtn.disabled = isCapturing;
  }

  // Render transcript
  function renderTranscript() {
    if (transcript.length === 0) {
      transcriptList.innerHTML = '<p class="empty-state">No transcript yet. Start capture to begin.</p>';
      return;
    }

    transcriptList.innerHTML = transcript.map(item => `
      <div class="transcript-item ${item.speaker === 'interviewer' ? 'interviewer' : 'candidate'}">
        <span class="speaker">${item.speaker === 'interviewer' ? 'Interviewer' : 'You'}</span>
        <span class="time">${item.time}</span>
        <p>${item.text}</p>
      </div>
    `).join('');

    transcriptList.scrollTop = transcriptList.scrollHeight;
  }

  // Render answers
  function renderAnswers() {
    if (answers.length === 0) {
      answersList.innerHTML = '<p class="empty-state">AI answers will appear here</p>';
      return;
    }

    answersList.innerHTML = answers.map(answer => `
      <div class="answer-item" data-answer="${encodeURIComponent(answer.text)}">
        <div class="answer-header">
          <span class="question">${answer.question}</span>
          <button class="copy-btn" title="Copy">Copy</button>
        </div>
        <p class="answer-text">${answer.text}</p>
      </div>
    `).join('');

    // Add copy handlers
    answersList.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = decodeURIComponent(btn.closest('.answer-item').dataset.answer);
        navigator.clipboard.writeText(text);
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1500);
      });
    });

    answersList.querySelectorAll('.answer-item').forEach(item => {
      item.addEventListener('click', () => {
        if (autoPaste && currentTabId) {
          const text = decodeURIComponent(item.dataset.answer);
          chrome.tabs.sendMessage(currentTabId, { 
            type: 'PASTE_TEXT', 
            text 
          });
        }
      });
    });
  }

  // Status polling
  function startStatusPolling() {
    setInterval(async () => {
      if (!isCapturing) return;
      
      try {
        const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
        if (!status.active && isCapturing) {
          isCapturing = false;
          currentTabId = null;
          updateUI();
          statusEl.textContent = 'Tab closed';
        }
      } catch {}
    }, 2000);
  }

  // Handle messages from background
  chrome.runtime.onMessage.addListener(message => {
    switch (message.type) {
      case 'TRANSCRIPT_UPDATE':
        transcript = message.transcript || [];
        renderTranscript();
        break;
      case 'ANSWER_GENERATED':
        if (message.answer) {
          answers.unshift(message.answer);
          renderAnswers();
          modelBadge.textContent = 'AI Active';
          
          if (autoPaste && currentTabId) {
            chrome.tabs.sendMessage(currentTabId, { 
              type: 'PASTE_TEXT', 
              text: message.answer.text 
            });
          }
        }
        break;
      case 'CAPTURE_STOPPED':
        isCapturing = false;
        currentTabId = null;
        updateUI();
        statusEl.textContent = 'Ready';
        modelBadge.textContent = 'Ready';
        break;
      case 'AUDIO_LEVEL':
        const level = Math.min(100, message.level * 100);
        volumeBar.style.width = `${level}%`;
        volumeValue.textContent = `${Math.round(level)}%`;
        
        if (level > 70) {
          volumeBar.classList.add('high');
        } else {
          volumeBar.classList.remove('high');
        }
        break;
    }
  });

  // Start
  init();
})();
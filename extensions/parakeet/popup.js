// Parakeet AI - Popup Controller

(function() {
  'use strict';

  // State
  let isSessionActive = false;
  let currentTabId = null;
  let sessionStart = null;
  let durationInterval = null;
  let selectedModel = 'gpt-4.1';

  // DOM
  const $ = id => document.getElementById(id);
  const setupView = $('setup-view');
  const sessionView = $('session-view');
  const status = $('status');
  const tabSelect = $('tab-select');
  const startBtn = $('start-btn');
  const stopBtn = $('stop-btn');
  const settingsBtn = $('settings-btn');
  const settingsModal = $('settings-modal');
  const sessionDuration = $('session-duration');

  // Initialize
  async function init() {
    await loadSettings();
    await detectMeeting();
    await loadTabs();
    setupEventListeners();
    setupKeyboardShortcuts();
    checkSession();
  }

  // Load settings
  async function loadSettings() {
    const result = await chrome.storage.local.get(['apiKey', 'resume', 'jobDesc', 'language', 'autoDetect']);
    
    if (result.apiKey) $('api-key').value = result.apiKey;
    if (result.resume) $('resume').value = result.resume;
    if (result.jobDesc) $('job-desc').value = result.jobDesc;
    if (result.language) $('language-select').value = result.language;
    if (result.autoDetect !== undefined) $('auto-detect').checked = result.autoDetect;
  }

  // Save settings
  async function saveSettings() {
    await chrome.storage.local.set({
      apiKey: $('api-key').value,
      resume: $('resume').value,
      jobDesc: $('job-desc').value,
      language: $('language-select').value,
      autoDetect: $('auto-detect').checked,
      model: selectedModel
    });
    settingsModal.classList.add('hidden');
  }

  // Detect meeting automatically
  async function detectMeeting() {
    try {
      const meeting = await chrome.runtime.sendMessage({ type: 'DETECT_MEETING' });
      if (meeting) {
        tabSelect.value = meeting.id;
        status.textContent = 'Meeting detected';
        status.classList.add('active');
      }
    } catch {}
  }

  // Load available tabs
  async function loadTabs() {
    try {
      const tabs = await chrome.runtime.sendMessage({ type: 'GET_TABS' });
      tabSelect.innerHTML = '<option value="">Select meeting tab...</option>';
      
      if (!tabs || tabs.length === 0) {
        tabSelect.innerHTML = '<option value="">No tabs found</option>';
        return;
      }

      tabs.forEach(tab => {
        const option = document.createElement('option');
        option.value = tab.id;
        try {
          const url = new URL(tab.url);
          option.textContent = `${tab.title?.substring(0, 40) || 'Untitled'} (${url.hostname})`;
        } catch {
          option.textContent = tab.title?.substring(0, 50) || 'Untitled';
        }
        tabSelect.appendChild(option);
      });
    } catch (err) {
      console.error('Failed to load tabs:', err);
    }
  }

  // Check for active session
  async function checkSession() {
    try {
      const status = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
      if (status.active) {
        startSession(status.tabId);
      }
    } catch {}
  }

  // Start session
  async function startSession(tabId) {
    const selectedTabId = tabId || parseInt(tabSelect.value);
    if (!selectedTabId) {
      status.textContent = 'Select a tab first';
      status.classList.add('error');
      return;
    }

    try {
      const result = await chrome.runtime.sendMessage({ 
        type: 'START_CAPTURE', 
        tabId: selectedTabId 
      });

      if (result.success) {
        isSessionActive = true;
        currentTabId = selectedTabId;
        sessionStart = Date.now();
        showSessionView();
        startDurationTimer();
      } else {
        status.textContent = result.error || 'Failed';
        status.classList.add('error');
      }
    } catch (err) {
      status.textContent = err.message;
      status.classList.add('error');
    }
  }

  // Stop session
  async function stopSession() {
    await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });
    
    isSessionActive = false;
    currentTabId = null;
    clearInterval(durationInterval);
    showSetupView();
    status.textContent = 'Ready';
    status.classList.remove('active', 'error');
  }

  // Show session view
  function showSessionView() {
    setupView.classList.add('hidden');
    sessionView.classList.remove('hidden');
    status.textContent = 'Live';
    status.classList.add('active');
    status.classList.remove('error');
  }

  // Show setup view
  function showSetupView() {
    sessionView.classList.add('hidden');
    setupView.classList.remove('hidden');
    status.textContent = 'Ready';
    status.classList.remove('active');
  }

  // Start duration timer
  function startDurationTimer() {
    clearInterval(durationInterval);
    durationInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      sessionDuration.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  // Add transcript item
  function addTranscriptItem(item) {
    const list = $('transcript-list');
    if (list.querySelector('.empty')) list.innerHTML = '';
    
    const div = document.createElement('div');
    div.className = 'transcript-item';
    div.innerHTML = `
      <span class="time">${item.time}</span>
      <p>${item.text}</p>
    `;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
  }

  // Add answer item
  function addAnswerItem(item) {
    const list = $('answers-list');
    if (list.querySelector('.empty')) list.innerHTML = '';
    
    const div = document.createElement('div');
    div.className = 'answer-item';
    div.innerHTML = `
      <div class="answer-question">${item.question}</div>
      <p class="answer-text">${item.text}</p>
      <div class="answer-actions">
        <button class="copy-btn" data-text="${encodeURIComponent(item.text)}">Copy</button>
      </div>
    `;
    list.prepend(div);
    list.scrollTop = 0;
    
    // Copy button
    div.querySelector('.copy-btn').addEventListener('click', (e) => {
      const text = decodeURIComponent(e.target.dataset.text);
      navigator.clipboard.writeText(text);
      e.target.textContent = 'Copied!';
      setTimeout(() => e.target.textContent = 'Copy', 1500);
    });
  }

  // Generate answer manually
  async function generateManualAnswer() {
    const question = $('quick-question').value.trim();
    if (!question) return;
    
    $('ask-btn').textContent = '...';
    try {
      const result = await chrome.runtime.sendMessage({ 
        type: 'GENERATE_ANSWER', 
        question 
      });
      if (result.answer) {
        addAnswerItem({ question, text: result.answer, time: new Date().toLocaleTimeString() });
        $('quick-question').value = '';
      }
    } catch {}
    $('ask-btn').textContent = 'Ask';
  }

  // Generate notes
  async function generateNotes() {
    $('generate-notes').textContent = 'Generating...';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'GENERATE_NOTES' });
      if (result.notes) {
        const list = $('notes-list');
        if (list.querySelector('.empty')) list.innerHTML = '';
        const div = document.createElement('div');
        div.className = 'notes-item';
        div.innerHTML = `<pre>${result.notes}</pre>`;
        list.appendChild(div);
      }
    } catch {}
    $('generate-notes').textContent = 'Generate Notes';
  }

  // Tab switching
  function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    $(`tab-${tabName}`).classList.remove('hidden');
  }

  // Event listeners
  function setupEventListeners() {
    startBtn.addEventListener('click', () => startSession());
    stopBtn.addEventListener('click', stopSession);
    $('refresh-tabs').addEventListener('click', loadTabs);
    $('ask-btn').addEventListener('click', generateManualAnswer);
    $('quick-question').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') generateManualAnswer();
    });
    $('generate-notes').addEventListener('click', generateNotes);
    $('save-settings').addEventListener('click', saveSettings);
    settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    $('close-settings').addEventListener('click', () => settingsModal.classList.add('hidden'));
    
    // Model selection
    document.querySelectorAll('.model-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.model-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedModel = btn.dataset.model;
      });
    });
    
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
  }

  // Keyboard shortcuts
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.key === 'p') {
        e.preventDefault();
        if (isSessionActive) stopSession();
        else startSession();
      }
    });
  }

  // Message listener
  chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case 'TRANSCRIPT_ADD':
        addTranscriptItem(message.item);
        break;
      case 'ANSWER_ADD':
        addAnswerItem(message.item);
        break;
      case 'SESSION_STOPPED':
        stopSession();
        break;
    }
  });

  // Start
  init();
})();
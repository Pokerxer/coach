// Parakeet AI - Popup Controller
// Connects to web app for auth, transcription, answers

(function() {
  'use strict';

  let isSessionActive = false;
  let currentTabId = null;
  let sessionStart = null;
  let durationInterval = null;

  const $ = id => document.getElementById(id);
  const authView = $('auth-view');
  const setupView = $('setup-view');
  const sessionView = $('session-view');
  const status = $('status');
  const tabSelect = $('tab-select');
  const startBtn = $('start-btn');

  async function init() {
    await getAppUrl();
    await checkAuth();
    await loadTabs();
    await detectMeeting();
    setupEventListeners();
  }

  // Get/set app URL
  async function getAppUrl() {
    const result = await chrome.storage.local.get(['appUrl']);
    return result.appUrl || 'http://localhost:3000';
  }

  // Check if user is authenticated
  async function checkAuth() {
    try {
      const appUrl = await getAppUrl();
      const resp = await fetch(`${appUrl}/api/profile`, {
        credentials: 'include'
      });
      
      if (resp.ok) {
        showView('setup');
        status.textContent = 'Ready';
      } else {
        showView('auth');
        status.textContent = 'Sign in required';
        status.classList.add('error');
      }
    } catch {
      showView('auth');
      status.textContent = 'App offline';
      status.classList.add('error');
    }
  }

  // Show view
  function showView(view) {
    authView.classList.toggle('hidden', view !== 'auth');
    setupView.classList.toggle('hidden', view !== 'setup');
    sessionView.classList.toggle('hidden', view !== 'session');
  }

  // Load tabs
  async function loadTabs() {
    try {
      const tabs = await chrome.runtime.sendMessage({ type: 'GET_TABS' });
      tabSelect.innerHTML = '<option value="">Select meeting tab...</option>';
      
      if (!tabs?.length) {
        tabSelect.innerHTML = '<option value="">No tabs found</option>';
        return;
      }

      tabs.forEach(tab => {
        const option = document.createElement('option');
        option.value = tab.id;
        try {
          const url = new URL(tab.url);
          option.textContent = `${tab.title?.substring(0, 40) || 'Tab'} — ${url.hostname}`;
        } catch {
          option.textContent = tab.title?.substring(0, 50) || 'Tab';
        }
        tabSelect.appendChild(option);
      });
    } catch {}
  }

  // Detect meeting
  async function detectMeeting() {
    try {
      const meeting = await chrome.runtime.sendMessage({ type: 'DETECT_MEETING' });
      if (meeting) {
        tabSelect.value = meeting.id;
        status.textContent = 'Meeting detected';
      }
    } catch {}
  }

  // Start session
  async function startSession() {
    const tabId = parseInt(tabSelect.value);
    if (!tabId) {
      status.textContent = 'Select a tab';
      status.classList.add('error');
      return;
    }

    startBtn.disabled = true;
    startBtn.innerHTML = '<span class="btn-icon">⏳</span> Starting...';

    try {
      const result = await chrome.runtime.sendMessage({ 
        type: 'START_CAPTURE', 
        tabId,
        autoAnswer: $('auto-answer').checked
      });

      if (result.success) {
        isSessionActive = true;
        currentTabId = tabId;
        sessionStart = Date.now();
        showView('session');
        startDurationTimer();
      } else {
        status.textContent = result.error || 'Failed';
        status.classList.add('error');
      }
    } catch (err) {
      status.textContent = err.message;
      status.classList.add('error');
    } finally {
      startBtn.disabled = false;
      startBtn.innerHTML = '<span class="btn-icon">▶</span> Start Session';
    }
  }

  // Stop session
  async function stopSession() {
    await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });
    isSessionActive = false;
    currentTabId = null;
    clearInterval(durationInterval);
    showView('setup');
    status.textContent = 'Ready';
    status.classList.remove('active', 'error');
  }

  // Duration timer
  function startDurationTimer() {
    clearInterval(durationInterval);
    durationInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      $('session-duration').textContent = `${mins}:${secs}`;
    }, 1000);
  }

  // Add transcript item
  function addTranscriptItem(item) {
    const list = $('transcript-list');
    if (list.querySelector('.empty')) list.innerHTML = '';
    
    const div = document.createElement('div');
    div.className = 'transcript-item';
    div.innerHTML = `<span class="time">${item.time}</span><p>${item.text}</p>`;
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
      <div class="answer-text">${item.text}</div>
      <div class="answer-actions">
        <button class="copy-btn" data-text="${encodeURIComponent(item.text)}">Copy</button>
      </div>
    `;
    list.prepend(div);
    
    div.querySelector('.copy-btn').addEventListener('click', (e) => {
      navigator.clipboard.writeText(decodeURIComponent(e.target.dataset.text));
      e.target.textContent = 'Copied!';
      setTimeout(() => e.target.textContent = 'Copy', 1500);
    });
  }

  // Generate manual answer
  async function generateManualAnswer() {
    const question = $('quick-question').value.trim();
    if (!question) return;
    
    $('ask-btn').disabled = true;
    $('ask-btn').textContent = '...';
    
    await chrome.runtime.sendMessage({ type: 'GENERATE_ANSWER', question });
    
    $('quick-question').value = '';
    $('ask-btn').disabled = false;
    $('ask-btn').textContent = 'Ask';
  }

  // Event listeners
  function setupEventListeners() {
    $('open-app-btn').addEventListener('click', async () => {
      const appUrl = await getAppUrl();
      chrome.tabs.create({ url: `${appUrl}/signin` });
    });
    
    $('start-btn').addEventListener('click', startSession);
    $('stop-btn').addEventListener('click', stopSession);
    $('refresh-tabs').addEventListener('click', () => { loadTabs(); detectMeeting(); });
    $('ask-btn').addEventListener('click', generateManualAnswer);
    $('quick-question').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') generateManualAnswer();
    });
    
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        tab.classList.add('active');
        $(`tab-${tab.dataset.tab}`).classList.remove('hidden');
      });
    });
  }

  // Listen for messages
  chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case 'TRANSCRIPT_ADD': addTranscriptItem(message.item); break;
      case 'ANSWER_ADD': addAnswerItem(message.item); break;
      case 'SESSION_END': stopSession(); break;
    }
  });

  init();
})();
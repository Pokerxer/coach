// Parakeet AI - Background Service Worker
// Connects to web app API for transcription + answers

let activeStream = null;
let activeTabId = null;
let mediaRecorder = null;
let audioChunks = [];
let sessionData = {
  active: false,
  sessionId: null,
  startTime: null,
  transcription: [],
  answers: []
};

// Get web app URL
async function getAppUrl() {
  const result = await chrome.storage.local.get(['appUrl']);
  return result.appUrl || 'http://localhost:3000';
}

// Get Supabase session cookie
async function getSessionCookie() {
  const cookies = await chrome.cookies.getAll({});
  const sbCookie = cookies.find(c => 
    c.name.includes('supabase') && c.name.includes('token')
  );
  return sbCookie?.value || null;
}

// API helper with auth
async function apiCall(endpoint, options = {}) {
  const appUrl = await getAppUrl();
  const url = `${appUrl}${endpoint}`;
  
  const resp = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`API error: ${resp.status} ${err}`);
  }
  
  return resp;
}

// Start tab capture
async function startCapture(tabId) {
  await stopCapture();
  
  try {
    const stream = await chrome.tabCapture.capture({
      audio: true,
      video: false
    });
    
    if (!stream || stream.getAudioTracks().length === 0) {
      throw new Error('No audio available');
    }
    
    activeStream = stream;
    activeTabId = tabId;
    
    // Set up MediaRecorder
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm'
    });
    
    audioChunks = [];
    
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
        
        // Transcribe every 3 chunks (3 seconds)
        if (audioChunks.length >= 3) {
          const blob = new Blob(audioChunks, { type: 'audio/webm' });
          audioChunks = [];
          await processAudio(blob);
        }
      }
    };
    
    mediaRecorder.start(1000);
    
    stream.getAudioTracks()[0].onended = () => {
      stopCapture();
    };
    
    chrome.runtime.sendMessage({ type: 'SESSION_START', tabId });
    
    return { success: true };
  } catch (err) {
    console.error('Capture failed:', err);
    return { success: false, error: err.message };
  }
}

// Stop capture
async function stopCapture() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    // Final chunk
    if (audioChunks.length > 0) {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      await processAudio(blob);
      audioChunks = [];
    }
    mediaRecorder.stop();
  }
  
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop());
    activeStream = null;
  }
  
  mediaRecorder = null;
  activeTabId = null;
  sessionData.active = false;
  
  // End session in DB
  if (sessionData.sessionId) {
    try {
      await apiCall(`/api/sessions/${sessionData.sessionId}/end`, {
        method: 'POST'
      });
    } catch {}
  }
  
  chrome.runtime.sendMessage({ type: 'SESSION_END' });
}

// Process audio chunk - transcribe + generate answer
async function processAudio(audioBlob) {
  try {
    // Transcribe
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.webm');
    
    const transResp = await fetch(`${await getAppUrl()}/api/transcribe`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    
    if (!transResp.ok) return;
    
    const transData = await transResp.json();
    const text = transData.text?.trim();
    
    if (!text || text.length < 5) return;
    
    // Add to transcript
    const item = {
      text,
      time: new Date().toLocaleTimeString()
    };
    sessionData.transcription.push(item);
    
    chrome.runtime.sendMessage({ 
      type: 'TRANSCRIPT_ADD', 
      item 
    });
    
    // Detect question + generate answer
    if (isQuestion(text)) {
      await generateAnswer(text);
    }
  } catch (err) {
    console.error('Process failed:', err);
  }
}

// Check if text is a question
function isQuestion(text) {
  return text.includes('?') || 
    /^(who|what|when|where|why|how|can|could|would|should|do|does|did|are|is|were|was|tell|describe|explain)\b/i.test(text);
}

// Generate AI answer via web app
async function generateAnswer(question) {
  try {
    const appUrl = await getAppUrl();
    const resp = await fetch(`${appUrl}/api/answer`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        model: 'gpt-4o-mini',
        history: sessionData.answers.slice(-5)
      })
    });
    
    if (!resp.ok || !resp.body) return;
    
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let fullAnswer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        if (raw === '[DONE]') continue;
        try {
          const obj = JSON.parse(raw);
          if (obj.token) {
            fullAnswer += obj.token;
          }
        } catch {}
      }
    }
    
    if (fullAnswer) {
      const answerItem = {
        question: question.substring(0, 100) + (question.length > 100 ? '...' : ''),
        text: fullAnswer,
        time: new Date().toLocaleTimeString()
      };
      sessionData.answers.push(answerItem);
      
      chrome.runtime.sendMessage({ 
        type: 'ANSWER_ADD', 
        item: answerItem 
      });
      
      // Save to DB
      if (sessionData.sessionId) {
        try {
          await apiCall(`/api/sessions/${sessionData.sessionId}/qa`, {
            method: 'POST',
            body: JSON.stringify({ question, answer: fullAnswer })
          });
        } catch {}
      }
    }
  } catch (err) {
    console.error('Answer failed:', err);
  }
}

// Create session in DB
async function createSession(data) {
  try {
    const resp = await apiCall('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    const result = await resp.json();
    return result.session?.id;
  } catch (err) {
    console.error('Create session failed:', err);
    return null;
  }
}

// Get tabs
async function getTabs() {
  const tabs = await chrome.tabs.query({ 
    status: 'complete',
    windowType: 'normal'
  });
  return tabs
    .filter(tab => tab.url && !tab.url.startsWith('chrome') && !tab.url.startsWith('devtools'))
    .map(tab => ({ id: tab.id, title: tab.title, url: tab.url }));
}

// Detect meeting
async function detectMeeting() {
  const tabs = await getTabs();
  const patterns = ['zoom.us', 'meet.google.com', 'teams.microsoft.com', 'webex.com'];
  return tabs.find(tab => patterns.some(p => tab.url.includes(p)));
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    START_CAPTURE: async () => {
      // Create session first
      const sessionId = await createSession({
        jobTitle: message.jobTitle,
        companyName: message.companyName,
        model: message.model || 'gpt-4o-mini'
      });
      
      sessionData.sessionId = sessionId;
      sessionData.active = true;
      sessionData.startTime = Date.now();
      sessionData.transcription = [];
      sessionData.answers = [];
      
      sendResponse(await startCapture(message.tabId));
    },
    STOP_CAPTURE: async () => { await stopCapture(); sendResponse({}); },
    GET_TABS: async () => sendResponse(await getTabs()),
    DETECT_MEETING: async () => sendResponse(await detectMeeting()),
    GET_STATUS: () => sendResponse(sessionData),
    GENERATE_ANSWER: async () => {
      await generateAnswer(message.question);
      sendResponse({});
    },
    SET_APP_URL: async () => {
      await chrome.storage.local.set({ appUrl: message.url });
      sendResponse({});
    }
  };
  
  if (handlers[message.type]) {
    handlers[message.type]();
    return true;
  }
});

// Cleanup
chrome.tabs.onRemoved.addListener(tabId => {
  if (tabId === activeTabId) stopCapture();
});
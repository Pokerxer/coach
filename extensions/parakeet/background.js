// Parakeet AI - Background Service Worker

let activeStream = null;
let activeTabId = null;
let mediaRecorder = null;
let audioChunks = [];
let transcription = [];
let answers = [];
let interviewNotes = [];
let sessionStartTime = null;
let isSessionActive = false;

// Load config
async function getConfig() {
  const result = await chrome.storage.local.get([
    'apiKey', 'model', 'resume', 'jobDescription', 'autoDetect', 'language'
  ]);
  return {
    apiKey: result.apiKey || '',
    model: result.model || 'gpt-4.1',
    resume: result.resume || '',
    jobDescription: result.jobDescription || '',
    autoDetect: result.autoDetect !== false,
    language: result.language || 'en'
  };
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
      throw new Error('No audio track');
    }
    
    activeStream = stream;
    activeTabId = tabId;
    sessionStartTime = Date.now();
    isSessionActive = true;
    transcription = [];
    answers = [];
    interviewNotes = [];
    
    stream.getAudioTracks()[0].onended = () => {
      stopCapture();
    };
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Stop capture
async function stopCapture() {
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop());
    activeStream = null;
  }
  activeTabId = null;
  isSessionActive = false;
  sessionStartTime = null;
}

// Get available tabs
function getTabs() {
  return chrome.tabs.query({ 
    status: 'complete',
    windowType: 'normal',
    active: false
  }).then(tabs => {
    return tabs.filter(tab => 
      tab.url && 
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('chrome-extension://') &&
      !tab.url.startsWith('devtools://')
    ).map(tab => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl
    }));
  });
}

// Transcribe audio using Web Speech API (browser built-in)
async function transcribeAudio(audioBlob) {
  const config = await getConfig();
  
  // Try Whisper API first if key exists
  if (config.apiKey) {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', config.language);
      
      const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
        body: formData
      });
      
      if (resp.ok) {
        const data = await resp.json();
        return data.text;
      }
    } catch {}
  }
  
  return '';
}

// Generate AI answer
async function generateAnswer(question) {
  const config = await getConfig();
  
  if (!config.apiKey) {
    return 'Set your API key in settings to enable AI answers.';
  }
  
  const systemPrompt = `You are an interview assistant. Based on the candidate's resume and job description, provide concise, natural-sounding answers to interview questions. Keep answers under 150 words. Match the candidate's experience level and background.

Resume: ${config.resume}

Job: ${config.jobDescription}`;

  try {
    const model = config.model === 'claude-4' 
      ? 'claude-sonnet-4-20250514' 
      : config.model === 'gpt-5' 
        ? 'gpt-5' 
        : 'gpt-4.1';
    
    const resp = await fetch(`https://api.openai.com/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ],
        max_tokens: 400,
        temperature: 0.7
      })
    });
    
    if (resp.ok) {
      const data = await resp.json();
      return data.choices[0].message.content;
    }
  } catch {}
  
  return 'Failed to generate answer. Check your API key.';
}

// Check if text is a question
function isQuestion(text) {
  return text.includes('?') || 
    /^(who|what|when|where|why|how|can|could|would|should|do|does|did|are|is|were|was)\b/i.test(text);
}

// Process transcribed text
async function processTranscription(text) {
  if (!text || text.trim().length < 10) return;
  
  const timestamp = new Date().toLocaleTimeString();
  transcription.push({ text, time: timestamp, speaker: 'interviewer' });
  
  // Send to popup
  chrome.runtime.sendMessage({ 
    type: 'TRANSCRIPT_ADD', 
    item: { text, time: timestamp, speaker: 'interviewer' }
  });
  
  // Auto-detect questions
  if (isQuestion(text)) {
    const config = await getConfig();
    if (config.autoDetect) {
      const answer = await generateAnswer(text);
      const answerItem = {
        question: text.substring(0, 80) + (text.length > 80 ? '...' : ''),
        text: answer,
        time: timestamp
      };
      answers.push(answerItem);
      
      chrome.runtime.sendMessage({ 
        type: 'ANSWER_ADD', 
        item: answerItem 
      });
    }
  }
}

// Generate post-interview notes
async function generateNotes() {
  const config = await getConfig();
  if (!config.apiKey || transcription.length === 0) return null;
  
  const fullTranscript = transcription.map(t => t.text).join(' ');
  
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [
          { role: 'system', content: 'Summarize this interview. List key questions asked, topics covered, and areas where the candidate could improve.' },
          { role: 'user', content: fullTranscript }
        ],
        max_tokens: 800
      })
    });
    
    if (resp.ok) {
      const data = await resp.json();
      return data.choices[0].message.content;
    }
  } catch {}
  
  return null;
}

// Detect meeting tab (auto-detect)
async function detectMeeting() {
  const tabs = await getTabs();
  const meetingPatterns = [
    'zoom.us', 'meet.google.com', 'teams.microsoft.com', 
    'webex.com', 'chime.aws', 'hacker', 'leetcode'
  ];
  
  for (const tab of tabs) {
    if (meetingPatterns.some(p => tab.url.includes(p))) {
      return tab;
    }
  }
  return null;
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    START_CAPTURE: async () => sendResponse(await startCapture(message.tabId)),
    STOP_CAPTURE: async () => {
      await stopCapture();
      sendResponse({ success: true });
    },
    GET_TABS: async () => sendResponse(await getTabs()),
    GET_STATUS: () => sendResponse({ 
      active: isSessionActive, 
      tabId: activeTabId,
      startTime: sessionStartTime
    }),
    TRANSCRIBE: async () => {
      const text = await transcribeAudio(message.audioBlob);
      if (text) processTranscription(text);
      sendResponse({ text });
    },
    GENERATE_ANSWER: async () => {
      const answer = await generateAnswer(message.question);
      const item = { question: message.question, text: answer, time: new Date().toLocaleTimeString() };
      answers.push(item);
      chrome.runtime.sendMessage({ type: 'ANSWER_ADD', item });
      sendResponse({ answer });
    },
    GENERATE_NOTES: async () => {
      const notes = await generateNotes();
      sendResponse({ notes });
    },
    DETECT_MEETING: async () => {
      const tab = await detectMeeting();
      sendResponse(tab);
    },
    GET_SESSION: () => sendResponse({
      active: isSessionActive,
      transcription,
      answers,
      notes: interviewNotes,
      duration: sessionStartTime ? (Date.now() - sessionStartTime) / 1000 : 0
    })
  };
  
  if (handlers[message.type]) {
    handlers[message.type]();
    return true;
  }
});

// Clean up on tab close
chrome.tabs.onRemoved.addListener(tabId => {
  if (tabId === activeTabId) stopCapture();
});
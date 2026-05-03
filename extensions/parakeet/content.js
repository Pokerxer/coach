// Parakeet AI - Content Script
// Runs in the captured page for interaction

(function() {
  'use strict';

  let clickthroughEnabled = false;
  let stealthEnabled = false;

  // Handle messages from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'PASTE_TEXT':
        pasteText(message.text);
        sendResponse({ success: true });
        break;
        
      case 'SET_CLICKTHROUGH':
        setClickthrough(message.enabled);
        sendResponse({ success: true });
        break;
        
      case 'SET_STEALTH':
        setStealth(message.enabled);
        sendResponse({ success: true });
        break;
        
      case 'GET_PAGE_INFO':
        sendResponse({
          title: document.title,
          url: window.location.href,
          clickthroughEnabled,
          stealthEnabled
        });
        break;
    }
  });

  // Paste text at cursor position
  function pasteText(text) {
    const activeEl = document.activeElement;
    
    // Try to find a text input
    const input = document.querySelector('input:focus, textarea:focus, [contenteditable="true"]:focus') || activeEl;
    
    if (input) {
      // For input/textarea
      if (input.value !== undefined) {
        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        const before = input.value.substring(0, start);
        const after = input.value.substring(end);
        input.value = before + text + after;
        input.selectionStart = input.selectionEnd = start + text.length;
      } 
      // For contenteditable
      else if (input.textContent !== undefined) {
        const start = window.getSelection().anchorOffset;
        const range = window.getSelection().getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
      }
      
      // Dispatch input event
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      
      return true;
    }
    
    return false;
  }

  // Enable/disable click-through (pointer-events: none on overlay elements if present)
  function setClickthrough(enabled) {
    clickthroughEnabled = enabled;
    
    // Try to set pointer-events on common overlay selectors
    const selectors = [
      '.parakeet-overlay',
      '.parakeet-float',
      '[data-parakeet-overlay]'
    ];
    
    selectors.forEach(selector => {
      const el = document.querySelector(selector);
      if (el) {
        el.style.pointerEvents = enabled ? 'none' : 'auto';
      }
    });
  }

  // Set stealth mode (hide overlay from screen capture indicators)
  function setStealth(enabled) {
    stealthEnabled = enabled;
    
    // Apply various stealth techniques
    const selectors = [
      '.parakeet-overlay',
      '.parakeet-float',
      '#parakeet-float',
      '[data-parakeet="float"]'
    ];
    
    selectors.forEach(selector => {
      const el = document.querySelector(selector);
      if (el) {
        if (enabled) {
          el.style.visibility = 'hidden';
          el.setAttribute('data-stealth', 'true');
        } else {
          el.style.visibility = 'visible';
          el.removeAttribute('data-stealth');
        }
      }
    });
  }

  // Keyboard shortcut handler
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'p') {
      e.preventDefault();
      // Toggle capture from popup
      chrome.runtime.sendMessage({ type: 'TOGGLE_CAPTURE' });
    }
    
    if (e.altKey && e.key === 'h') {
      e.preventDefault();
      // Toggle stealth
      chrome.runtime.sendMessage({ type: 'TOGGLE_STEALTH' });
    }
  });
})();
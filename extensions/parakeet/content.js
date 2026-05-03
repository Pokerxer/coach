// Parakeet AI - Content Script

(function() {
  'use strict';

  // Handle messages from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'PASTE_TEXT':
        pasteText(message.text);
        sendResponse({ success: true });
        break;
        
      case 'GET_PAGE_INFO':
        sendResponse({
          title: document.title,
          url: window.location.href
        });
        break;
    }
  });

  // Paste text at cursor position
  function pasteText(text) {
    const activeEl = document.activeElement;
    
    if (activeEl) {
      // For input/textarea
      if (activeEl.value !== undefined) {
        const start = activeEl.selectionStart || 0;
        const end = activeEl.selectionEnd || 0;
        const before = activeEl.value.substring(0, start);
        const after = activeEl.value.substring(end);
        activeEl.value = before + text + after;
        activeEl.selectionStart = activeEl.selectionEnd = start + text.length;
      } 
      // For contenteditable
      else if (activeEl.textContent !== undefined) {
        const sel = window.getSelection();
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
      }
      
      // Dispatch events
      activeEl.dispatchEvent(new Event('input', { bubbles: true }));
      activeEl.dispatchEvent(new Event('change', { bubbles: true }));
      
      return true;
    }
    
    return false;
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'p') {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: 'TOGGLE_CAPTURE' });
    }
  });
})();
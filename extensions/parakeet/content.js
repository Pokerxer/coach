// Parakeet AI - Content Script

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PASTE_TEXT') {
    const activeEl = document.activeElement;
    if (activeEl) {
      if (activeEl.value !== undefined) {
        const start = activeEl.selectionStart || 0;
        const end = activeEl.selectionEnd || 0;
        activeEl.value = activeEl.value.substring(0, start) + message.text + activeEl.value.substring(end);
        activeEl.selectionStart = activeEl.selectionEnd = start + message.text.length;
      }
      activeEl.dispatchEvent(new Event('input', { bubbles: true }));
      activeEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sendResponse({ success: true });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'p') {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'TOGGLE_CAPTURE' });
  }
});
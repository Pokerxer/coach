// Parakeet AI - Content Script
// Injects into the captured page for auto-paste functionality

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PASTE_TEXT') {
    // Paste text at cursor position
    const textarea = document.querySelector('textarea, input[type="text"], [contenteditable="true"]');
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value || textarea.textContent || '';
      const before = text.substring(0, start);
      const after = text.substring(end);
      const newText = before + message.text + after;
      
      if (textarea.value !== undefined) {
        textarea.value = newText;
      } else {
        textarea.textContent = newText;
      }
      
      textarea.selectionStart = textarea.selectionEnd = start + message.text.length;
      textarea.focus();
      
      // Dispatch input event to notify the app
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    sendResponse({ success: true });
  }
});
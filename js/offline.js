/**
 * オフライン層: IndexedDB によるパッチ永続化 + 準備状態
 */
const OfflineStore = (() => {
    const DB_NAME = "pink-noise-offline";
    const DB_VERSION = 1;
    const STORE = "assets";
    const PATCH_KEY = "patcher";

    /** @returns {Promise<IDBDatabase>} */
    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE);
                }
            };
        });
    }

    async function savePatcher(patcher) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
            tx.objectStore(STORE).put(patcher, PATCH_KEY);
        });
    }

    async function loadPatcher() {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readonly");
            const req = tx.objectStore(STORE).get(PATCH_KEY);
            req.onsuccess = () => {
                db.close();
                resolve(req.result ?? null);
            };
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * ネットワーク → IDB の順でパッチを取得
     * @param {string} patchUrl absolute or resolved URL
     */
    async function fetchPatcher(patchUrl) {
        try {
            const response = await fetch(patchUrl, { cache: "force-cache" });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const patcher = await response.json();
            try {
                await savePatcher(patcher);
            } catch (e) {
                console.warn("IDB save failed:", e);
            }
            return { patcher, source: "network" };
        } catch (networkErr) {
            console.warn("Network patch fetch failed:", networkErr);
            const fromDb = await loadPatcher();
            if (fromDb) {
                return { patcher: fromDb, source: "idb" };
            }
            throw networkErr;
        }
    }

    return { fetchPatcher, loadPatcher, savePatcher };
})();
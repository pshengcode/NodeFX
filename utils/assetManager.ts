
import { RawTextureData } from '../types';
import { getBuiltinResource } from './builtinResources';

// Simple IDB Wrapper
const DB_NAME = 'glsl-editor-assets';
const STORE_NAME = 'textures';

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

class AssetManager {
    // Cache stores data + timestamp for LRU
    private cache: Map<string, { data: string | RawTextureData, lastUsed: number }> = new Map();
    private dbPromise: Promise<IDBDatabase>;
    private MAX_CACHE_SIZE = 50; // Max items in memory

    constructor() {
        this.dbPromise = openDB();
    }

    // Generate a unique ID
    createId(prefix: string): string {
        return `asset://${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }

    // Save asset (Memory + Disk)
    async save(id: string, data: string | RawTextureData): Promise<void> {
        this.cache.set(id, { data, lastUsed: Date.now() });
        this.pruneCache();
        
        try {
            const db = await this.dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const req = store.put(data, id);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.warn("Failed to save asset to IndexedDB:", e);
        }
    }

    // Get asset
    async get(id: string): Promise<string | RawTextureData | undefined> {
        // 0. Check Built-in
        if (id.startsWith('builtin://')) {
            const res = getBuiltinResource(id);
            return res ? res.url : undefined;
        }

        // 1. Check Memory
        if (this.cache.has(id)) {
            const entry = this.cache.get(id)!;
            entry.lastUsed = Date.now(); // Update LRU
            return entry.data;
        }

        // 2. Check Disk
        try {
            const db = await this.dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.get(id);
                req.onsuccess = () => {
                    const res = req.result;
                    if (res) {
                        this.cache.set(id, { data: res, lastUsed: Date.now() }); // Populate cache
                        this.pruneCache();
                    }
                    resolve(res);
                };
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.warn("Failed to load asset from IndexedDB:", e);
            return undefined;
        }
    }

    // Synchronous get (for render loops, assumes loaded)
    getSync(id: string): string | RawTextureData | undefined {
        if (id.startsWith('builtin://')) {
            const res = getBuiltinResource(id);
            return res ? res.url : undefined;
        }
        const entry = this.cache.get(id);
        if (entry) {
            entry.lastUsed = Date.now();
            return entry.data;
        }
        return undefined;
    }

    // Ensure asset is loaded (helper for components)
    async ensure(id: string) {
        if (!this.cache.has(id)) {
            await this.get(id);
        }
    }

    private pruneCache() {
        if (this.cache.size <= this.MAX_CACHE_SIZE) return;

        // Convert to array and sort by lastUsed (ascending = oldest first)
        const entries = Array.from(this.cache.entries());
        entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);

        // Remove oldest items until we fit
        const toRemoveCount = this.cache.size - this.MAX_CACHE_SIZE;
        for (let i = 0; i < toRemoveCount; i++) {
            this.cache.delete(entries[i][0]);
        }
    }
}

export const assetManager = new AssetManager();

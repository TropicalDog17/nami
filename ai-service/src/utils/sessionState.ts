import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";
import { PendingActionCreate, ActionRequest } from "../core/schemas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, "../../data/session-state.json");

interface PendingBatchItem {
    id: string;
    messageId: number;
    text: string;
    payload: PendingActionCreate;
    parsedAction?: ActionRequest;
    status: "pending" | "approved" | "rejected";
}

interface PendingBatch {
    items: PendingBatchItem[];
    correlationId: string;
    chatId: number;
    topicId: number;
    displayMessageId?: number;
}

interface SessionState {
    awaitingAccountForBatch?: string;
    pendingReview?: {
        payload: PendingActionCreate;
        correlationId: string;
        parsedAction: any;
    };
    pendingBatch?: PendingBatch;
}

interface PersistedStateData {
    sessions: Record<string, SessionState>;
    updatedAt: string;
}

function ensureDataDir(): void {
    const dataDir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

function loadState(): PersistedStateData {
    ensureDataDir();
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, "utf-8");
            return JSON.parse(data);
        }
    } catch (e) {
        logger.warn({ error: e }, "Failed to load session state, using empty state");
    }
    return { sessions: {}, updatedAt: new Date().toISOString() };
}

function saveState(state: PersistedStateData): void {
    ensureDataDir();
    try {
        state.updatedAt = new Date().toISOString();
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) {
        logger.error({ error: e }, "Failed to save session state");
    }
}

/**
 * Persistent session store that survives service restarts.
 * Stores pending batches and review states to disk.
 */
class PersistentSessionStore {
    private cache: Map<number, SessionState>;
    private loaded: boolean = false;

    constructor() {
        this.cache = new Map();
    }

    private ensureLoaded(): void {
        if (!this.loaded) {
            this.loadFromDisk();
            this.loaded = true;
        }
    }

    private loadFromDisk(): void {
        const state = loadState();
        this.cache.clear();
        for (const [key, value] of Object.entries(state.sessions)) {
            this.cache.set(Number(key), value);
        }
        const sessionCount = this.cache.size;
        if (sessionCount > 0) {
            logger.info(
                { sessionCount },
                "Loaded persisted session state from disk"
            );
        }
    }

    private saveToDisk(): void {
        const sessions: Record<string, SessionState> = {};
        for (const [key, value] of this.cache.entries()) {
            sessions[String(key)] = value;
        }
        saveState({ sessions, updatedAt: new Date().toISOString() });
    }

    get(chatId: number): SessionState | undefined {
        this.ensureLoaded();
        return this.cache.get(chatId);
    }

    set(chatId: number, state: SessionState): void {
        this.ensureLoaded();
        this.cache.set(chatId, state);
        this.saveToDisk();
    }

    delete(chatId: number): boolean {
        this.ensureLoaded();
        const result = this.cache.delete(chatId);
        this.saveToDisk();
        return result;
    }

    has(chatId: number): boolean {
        this.ensureLoaded();
        return this.cache.has(chatId);
    }

    /**
     * Get count of sessions with pending batches
     */
    getPendingBatchCount(): number {
        this.ensureLoaded();
        let count = 0;
        for (const state of this.cache.values()) {
            if (state.pendingBatch && state.pendingBatch.items.length > 0) {
                count++;
            }
        }
        return count;
    }

    /**
     * Get total count of pending items across all sessions
     */
    getTotalPendingItems(): number {
        this.ensureLoaded();
        let total = 0;
        for (const state of this.cache.values()) {
            if (state.pendingBatch) {
                total += state.pendingBatch.items.filter(
                    (i) => i.status === "pending"
                ).length;
            }
        }
        return total;
    }
}

// Export singleton instance
export const sessionStore = new PersistentSessionStore();

// Re-export types for use in telegram.ts
export type { SessionState, PendingBatch, PendingBatchItem };

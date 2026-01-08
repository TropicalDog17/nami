import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, "../../data/topic-state.json");

interface TopicState {
    lastProcessedMessageId: number;
    updatedAt: string;
}

interface StateData {
    topics: Record<string, TopicState>;
}

function ensureDataDir(): void {
    const dataDir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

function loadState(): StateData {
    ensureDataDir();
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, "utf-8");
            return JSON.parse(data);
        }
    } catch (e) {
        logger.warn({ error: e }, "Failed to load topic state, using empty state");
    }
    return { topics: {} };
}

function saveState(state: StateData): void {
    ensureDataDir();
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) {
        logger.error({ error: e }, "Failed to save topic state");
    }
}

export function getLastProcessedMessageId(chatId: number, topicId: number): number {
    const state = loadState();
    const key = `${chatId}:${topicId}`;
    return state.topics[key]?.lastProcessedMessageId || 0;
}

export function setLastProcessedMessageId(
    chatId: number,
    topicId: number,
    messageId: number
): void {
    const state = loadState();
    const key = `${chatId}:${topicId}`;
    state.topics[key] = {
        lastProcessedMessageId: messageId,
        updatedAt: new Date().toISOString(),
    };
    saveState(state);
    logger.info(
        { chatId, topicId, messageId },
        "Updated last processed message ID"
    );
}

/**
 * 房間歷史記錄管理
 * 負責記錄房間的聊天訊息和對戰歷史
 * 使用寫入佇列解決多人同時寫入的同步問題
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 資料目錄
const DATA_DIR = path.join(__dirname, '..', 'data');
const ROOMS_DIR = path.join(DATA_DIR, 'rooms');
const ARCHIVE_DIR = path.join(DATA_DIR, 'archive');

// 寫入佇列 Map<roomCode, Promise>
const writeQueues = new Map();

/**
 * 確保目錄存在
 * @param {string} dir - 目錄路徑
 */
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// 初始化目錄
ensureDir(DATA_DIR);
ensureDir(ROOMS_DIR);
ensureDir(ARCHIVE_DIR);

/**
 * 取得房間記錄檔路徑
 * @param {string} roomCode - 房間代碼
 * @returns {string} 檔案路徑
 */
function getRoomFilePath(roomCode) {
    return path.join(ROOMS_DIR, `${roomCode}.json`);
}

/**
 * 串接寫入操作到佇列
 * @param {string} roomCode - 房間代碼
 * @param {function} writeOperation - 寫入操作函式
 * @returns {Promise} 寫入結果
 */
async function queueWrite(roomCode, writeOperation) {
    const currentQueue = writeQueues.get(roomCode) || Promise.resolve();
    
    const newQueue = currentQueue
        .then(() => writeOperation())
        .catch(err => {
            console.error(`[RoomHistory] 寫入錯誤 (${roomCode}):`, err);
        });
    
    writeQueues.set(roomCode, newQueue);
    
    // 清理已完成的佇列
    newQueue.finally(() => {
        if (writeQueues.get(roomCode) === newQueue) {
            writeQueues.delete(roomCode);
        }
    });
    
    return newQueue;
}

/**
 * 讀取房間記錄
 * @param {string} roomCode - 房間代碼
 * @returns {object|null} 房間記錄
 */
function readRoomHistory(roomCode) {
    const filePath = getRoomFilePath(roomCode);
    
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error(`[RoomHistory] 讀取錯誤 (${roomCode}):`, err);
    }
    
    return null;
}

/**
 * 寫入房間記錄（同步）
 * @param {string} roomCode - 房間代碼
 * @param {object} data - 記錄資料
 */
function writeRoomHistory(roomCode, data) {
    const filePath = getRoomFilePath(roomCode);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 初始化房間記錄
 * @param {string} roomCode - 房間代碼
 * @param {object} roomInfo - 房間資訊
 * @returns {Promise}
 */
export function initRoomHistory(roomCode, roomInfo) {
    return queueWrite(roomCode, () => {
        const history = {
            roomCode,
            createdAt: Date.now(),
            hostName: roomInfo.hostName || null,
            guestName: null,
            settings: roomInfo.settings || {},
            messages: [],
            games: [],
            events: [
                {
                    type: 'room_created',
                    timestamp: Date.now(),
                    data: { hostName: roomInfo.hostName }
                }
            ]
        };
        
        writeRoomHistory(roomCode, history);
        console.log(`[RoomHistory] 房間記錄已建立: ${roomCode}`);
    });
}

/**
 * 記錄玩家加入
 * @param {string} roomCode - 房間代碼
 * @param {string} guestName - 玩家名稱
 * @returns {Promise}
 */
export function recordPlayerJoin(roomCode, guestName) {
    return queueWrite(roomCode, () => {
        const history = readRoomHistory(roomCode);
        if (!history) return;
        
        history.guestName = guestName;
        history.events.push({
            type: 'player_joined',
            timestamp: Date.now(),
            data: { guestName }
        });
        
        writeRoomHistory(roomCode, history);
    });
}

/**
 * 記錄訊息（彈幕/留言）
 * @param {string} roomCode - 房間代碼
 * @param {object} message - 訊息內容
 * @returns {Promise}
 */
export function recordMessage(roomCode, message) {
    return queueWrite(roomCode, () => {
        const history = readRoomHistory(roomCode);
        if (!history) return;
        
        history.messages.push({
            id: message.id,
            nickname: message.nickname,
            message: message.message,
            timestamp: message.timestamp,
            isPlayer: message.isPlayer
        });
        
        writeRoomHistory(roomCode, history);
    });
}

/**
 * 記錄遊戲開始
 * @param {string} roomCode - 房間代碼
 * @param {object} gameInfo - 遊戲資訊
 * @returns {Promise}
 */
export function recordGameStart(roomCode, gameInfo) {
    return queueWrite(roomCode, () => {
        const history = readRoomHistory(roomCode);
        if (!history) return;
        
        const gameRecord = {
            gameIndex: history.games.length,
            startedAt: Date.now(),
            endedAt: null,
            startingPlayer: gameInfo.startingPlayer,
            settings: gameInfo.settings,
            moves: [],
            result: null
        };
        
        history.games.push(gameRecord);
        history.events.push({
            type: 'game_started',
            timestamp: Date.now(),
            data: { gameIndex: gameRecord.gameIndex, startingPlayer: gameInfo.startingPlayer }
        });
        
        writeRoomHistory(roomCode, history);
    });
}

/**
 * 記錄遊戲動作
 * @param {string} roomCode - 房間代碼
 * @param {object} move - 動作資訊
 * @returns {Promise}
 */
export function recordGameMove(roomCode, move) {
    return queueWrite(roomCode, () => {
        const history = readRoomHistory(roomCode);
        if (!history || history.games.length === 0) return;
        
        const currentGame = history.games[history.games.length - 1];
        currentGame.moves.push({
            type: move.type, // 'reveal' or 'pass'
            player: move.player,
            x: move.x,
            z: move.z,
            timestamp: Date.now(),
            hitMine: move.hitMine,
            revealedCount: move.revealedCount
        });
        
        writeRoomHistory(roomCode, history);
    });
}

/**
 * 記錄遊戲結束
 * @param {string} roomCode - 房間代碼
 * @param {object} result - 遊戲結果
 * @returns {Promise}
 */
export function recordGameEnd(roomCode, result) {
    return queueWrite(roomCode, () => {
        const history = readRoomHistory(roomCode);
        if (!history || history.games.length === 0) return;
        
        const currentGame = history.games[history.games.length - 1];
        currentGame.endedAt = Date.now();
        currentGame.result = {
            winner: result.winner,
            loser: result.loser,
            reason: result.reason,
            scores: result.scores
        };
        
        history.events.push({
            type: 'game_ended',
            timestamp: Date.now(),
            data: {
                gameIndex: currentGame.gameIndex,
                winner: result.winner,
                reason: result.reason
            }
        });
        
        writeRoomHistory(roomCode, history);
    });
}

/**
 * 記錄玩家離開
 * @param {string} roomCode - 房間代碼
 * @param {string} playerRole - 離開的玩家角色
 * @param {string} reason - 離開原因
 * @returns {Promise}
 */
export function recordPlayerLeave(roomCode, playerRole, reason = 'disconnect') {
    return queueWrite(roomCode, () => {
        const history = readRoomHistory(roomCode);
        if (!history) return;
        
        history.events.push({
            type: 'player_left',
            timestamp: Date.now(),
            data: { playerRole, reason }
        });
        
        writeRoomHistory(roomCode, history);
    });
}

/**
 * 取得房間完整歷史（供新加入觀戰者使用）
 * @param {string} roomCode - 房間代碼
 * @returns {object|null} 房間歷史記錄
 */
export function getRoomHistory(roomCode) {
    return readRoomHistory(roomCode);
}

/**
 * 取得房間訊息歷史
 * @param {string} roomCode - 房間代碼
 * @returns {array} 訊息列表
 */
export function getMessageHistory(roomCode) {
    const history = readRoomHistory(roomCode);
    return history ? history.messages : [];
}

/**
 * 封存房間記錄
 * @param {string} roomCode - 房間代碼
 * @returns {Promise<string|null>} 封存檔案路徑
 */
export function archiveRoomHistory(roomCode) {
    return queueWrite(roomCode, () => {
        const sourcePath = getRoomFilePath(roomCode);
        
        if (!fs.existsSync(sourcePath)) {
            console.log(`[RoomHistory] 無記錄檔可封存: ${roomCode}`);
            return null;
        }
        
        // 讀取並更新關閉時間
        const history = readRoomHistory(roomCode);
        if (history) {
            history.closedAt = Date.now();
            history.events.push({
                type: 'room_closed',
                timestamp: Date.now(),
                data: {}
            });
            writeRoomHistory(roomCode, history);
        }
        
        // 建立帶日期的封存檔名
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
        const archiveFileName = `${roomCode}_${dateStr}_${timeStr}.json`;
        const archivePath = path.join(ARCHIVE_DIR, archiveFileName);
        
        // 移動檔案到封存目錄
        fs.renameSync(sourcePath, archivePath);
        
        console.log(`[RoomHistory] 房間記錄已封存: ${roomCode} -> ${archiveFileName}`);
        return archivePath;
    });
}

/**
 * 清理過期的活動房間記錄（房間已不存在但檔案還在）
 * @param {Set<string>} activeRoomCodes - 活動中的房間代碼集合
 */
export function cleanupOrphanedRecords(activeRoomCodes) {
    try {
        const files = fs.readdirSync(ROOMS_DIR);
        
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            
            const roomCode = file.replace('.json', '');
            if (!activeRoomCodes.has(roomCode)) {
                // 房間已不存在，封存記錄
                archiveRoomHistory(roomCode);
            }
        }
    } catch (err) {
        console.error('[RoomHistory] 清理孤立記錄時發生錯誤:', err);
    }
}

export default {
    initRoomHistory,
    recordPlayerJoin,
    recordMessage,
    recordGameStart,
    recordGameMove,
    recordGameEnd,
    recordPlayerLeave,
    getRoomHistory,
    getMessageHistory,
    archiveRoomHistory,
    cleanupOrphanedRecords
};

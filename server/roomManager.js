/**
 * 房間管理系統
 * 負責建立、加入、離開房間的邏輯
 */
import { CONFIG } from './config.js';

// 儲存所有房間
const rooms = new Map();

/**
 * 生成隨機房間代碼
 * @returns {string} 6 位英數字代碼
 */
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除易混淆字元
    let code = '';
    for (let i = 0; i < CONFIG.ROOM_CODE_LENGTH; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // 確保代碼不重複
    if (rooms.has(code)) {
        return generateRoomCode();
    }
    return code;
}

/**
 * 建立新房間
 * @param {string} hostSocketId - 房主的 Socket ID
 * @param {string} hostName - 房主名稱
 * @param {object} options - 遊戲設定選項
 * @returns {object} 房間資訊
 */
export function createRoom(hostSocketId, hostName, options = {}) {
    const roomCode = generateRoomCode();

    const room = {
        code: roomCode,
        host: {
            socketId: hostSocketId,
            name: hostName || '玩家1',
            score: 0
        },
        guest: null,
        gameState: 'waiting', // waiting, playing, finished
        settings: {
            gridSize: options.gridSize || CONFIG.GRID_SIZE,
            minesCount: options.minesCount || CONFIG.DEFAULT_MINES_COUNT,
            turnTimeLimit: options.turnTimeLimit || CONFIG.TURN_TIME_LIMIT
        },
        game: null, // GameEngine 實例
        createdAt: Date.now(),
        gameStartedAt: null, // 遊戲開始時間
        spectators: new Set() // 觀戰者 Socket ID 集合
    };

    rooms.set(roomCode, room);

    console.log(`[RoomManager] 房間已建立: ${roomCode} by ${hostName}`);

    return room;
}

/**
 * 加入房間
 * @param {string} roomCode - 房間代碼
 * @param {string} guestSocketId - 加入者的 Socket ID
 * @param {string} guestName - 加入者名稱
 * @returns {object} { success: boolean, room?: object, error?: string }
 */
export function joinRoom(roomCode, guestSocketId, guestName) {
    const room = rooms.get(roomCode.toUpperCase());

    if (!room) {
        return { success: false, error: '房間不存在' };
    }

    if (room.gameState !== 'waiting') {
        return { success: false, error: '遊戲已開始' };
    }

    if (room.guest !== null) {
        return { success: false, error: '房間已滿' };
    }

    room.guest = {
        socketId: guestSocketId,
        name: guestName || '玩家2',
        score: 0
    };

    console.log(`[RoomManager] 玩家加入房間: ${roomCode} - ${guestName}`);

    return { success: true, room };
}

/**
 * 離開房間
 * @param {string} socketId - 離開者的 Socket ID
 * @returns {object|null} 離開的房間資訊，若無則返回 null
 */
export function leaveRoom(socketId) {
    for (const [code, room] of rooms.entries()) {
        // 檢查是否為房主
        if (room.host && room.host.socketId === socketId) {
            rooms.delete(code);
            console.log(`[RoomManager] 房主離開，房間已刪除: ${code}`);
            return { room, wasHost: true };
        }

        // 檢查是否為訪客
        if (room.guest && room.guest.socketId === socketId) {
            const guestInfo = room.guest;
            room.guest = null;

            // 如果遊戲進行中，訪客離開視為放棄
            if (room.gameState === 'playing') {
                room.gameState = 'finished';
            } else {
                room.gameState = 'waiting';
            }

            console.log(`[RoomManager] 訪客離開房間: ${code}`);
            return { room, wasHost: false, leftPlayer: guestInfo };
        }
    }

    return null;
}

/**
 * 根據房間代碼取得房間
 * @param {string} roomCode - 房間代碼
 * @returns {object|null} 房間資訊
 */
export function getRoomByCode(roomCode) {
    return rooms.get(roomCode.toUpperCase()) || null;
}

/**
 * 根據 Socket ID 取得所屬房間
 * @param {string} socketId - Socket ID
 * @returns {object|null} 房間資訊
 */
export function getRoomBySocketId(socketId) {
    for (const room of rooms.values()) {
        if (room.host?.socketId === socketId || room.guest?.socketId === socketId) {
            return room;
        }
    }
    return null;
}

/**
 * 取得房間中的對手
 * @param {string} roomCode - 房間代碼
 * @param {string} socketId - 當前玩家的 Socket ID
 * @returns {object|null} 對手資訊
 */
export function getOpponent(roomCode, socketId) {
    const room = rooms.get(roomCode.toUpperCase());
    if (!room) return null;

    if (room.host?.socketId === socketId) {
        return room.guest;
    } else if (room.guest?.socketId === socketId) {
        return room.host;
    }

    return null;
}

/**
 * 取得玩家在房間中的角色
 * @param {string} roomCode - 房間代碼
 * @param {string} socketId - Socket ID
 * @returns {'host'|'guest'|null}
 */
export function getPlayerRole(roomCode, socketId) {
    const room = rooms.get(roomCode.toUpperCase());
    if (!room) return null;

    if (room.host?.socketId === socketId) return 'host';
    if (room.guest?.socketId === socketId) return 'guest';

    return null;
}

/**
 * 清理閒置房間
 */
export function cleanupIdleRooms() {
    const now = Date.now();

    for (const [code, room] of rooms.entries()) {
        // 清理超過閒置時間的房間
        if (now - room.createdAt > CONFIG.ROOM_IDLE_TIMEOUT && room.gameState !== 'playing') {
            rooms.delete(code);
            console.log(`[RoomManager] 清理閒置房間: ${code}`);
        }
    }
}

/**
 * 取得所有房間（用於調試）
 */
export function getAllRooms() {
    return Array.from(rooms.values());
}

/**
 * 取得所有房間的統計資訊（用於後台管理）
 * @returns {object} 統計資訊
 */
export function getAllRoomsStats() {
    const roomsList = [];
    let playingCount = 0;
    let waitingCount = 0;
    let finishedCount = 0;

    for (const room of rooms.values()) {
        // 統計各狀態房間數
        if (room.gameState === 'playing') playingCount++;
        else if (room.gameState === 'waiting') waitingCount++;
        else if (room.gameState === 'finished') finishedCount++;

        // 計算遊玩時長
        let playDuration = null;
        if (room.gameStartedAt) {
            playDuration = Math.floor((Date.now() - room.gameStartedAt) / 1000);
        }

        roomsList.push({
            code: room.code,
            gameState: room.gameState,
            hostName: room.host?.name || null,
            guestName: room.guest?.name || null,
            settings: room.settings,
            createdAt: room.createdAt,
            gameStartedAt: room.gameStartedAt,
            playDuration,
            spectatorCount: room.spectators.size,
            currentPlayer: room.game?.currentPlayer || null,
            timeRemaining: room.game?.timeRemaining || null,
            scores: room.game?.scores || { host: 0, guest: 0 }
        });
    }

    return {
        totalRooms: rooms.size,
        playingCount,
        waitingCount,
        finishedCount,
        rooms: roomsList
    };
}

/**
 * 新增觀戰者到房間
 * @param {string} roomCode - 房間代碼
 * @param {string} socketId - 觀戰者 Socket ID
 * @returns {boolean} 是否成功
 */
export function addSpectator(roomCode, socketId) {
    const room = rooms.get(roomCode.toUpperCase());
    if (!room) return false;

    room.spectators.add(socketId);
    console.log(`[RoomManager] 觀戰者加入房間: ${roomCode}, 目前觀戰人數: ${room.spectators.size}`);
    return true;
}

/**
 * 移除觀戰者
 * @param {string} roomCode - 房間代碼
 * @param {string} socketId - 觀戰者 Socket ID
 * @returns {boolean} 是否成功
 */
export function removeSpectator(roomCode, socketId) {
    const room = rooms.get(roomCode.toUpperCase());
    if (!room) return false;

    room.spectators.delete(socketId);
    console.log(`[RoomManager] 觀戰者離開房間: ${roomCode}, 目前觀戰人數: ${room.spectators.size}`);
    return true;
}

/**
 * 根據 Socket ID 移除觀戰者（斷線時使用）
 * @param {string} socketId - 觀戰者 Socket ID
 * @returns {string|null} 離開的房間代碼
 */
export function removeSpectatorBySocketId(socketId) {
    for (const [code, room] of rooms.entries()) {
        if (room.spectators.has(socketId)) {
            room.spectators.delete(socketId);
            console.log(`[RoomManager] 觀戰者斷線離開房間: ${code}`);
            return code;
        }
    }
    return null;
}

/**
 * 取得房間觀戰人數
 * @param {string} roomCode - 房間代碼
 * @returns {number} 觀戰人數
 */
export function getSpectatorCount(roomCode) {
    const room = rooms.get(roomCode.toUpperCase());
    if (!room) return 0;
    return room.spectators.size;
}

/**
 * 取得房間所有觀戰者 Socket ID
 * @param {string} roomCode - 房間代碼
 * @returns {string[]} 觀戰者 Socket ID 陣列
 */
export function getSpectators(roomCode) {
    const room = rooms.get(roomCode.toUpperCase());
    if (!room) return [];
    return Array.from(room.spectators);
}

// 定期清理閒置房間
setInterval(cleanupIdleRooms, 5 * 60 * 1000); // 每 5 分鐘清理一次

export default {
    createRoom,
    joinRoom,
    leaveRoom,
    getRoomByCode,
    getRoomBySocketId,
    getOpponent,
    getPlayerRole,
    getAllRooms,
    getAllRoomsStats,
    addSpectator,
    removeSpectator,
    removeSpectatorBySocketId,
    getSpectatorCount,
    getSpectators
};

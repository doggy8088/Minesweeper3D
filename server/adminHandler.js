/**
 * 後台管理 Socket 事件處理器
 */
import { verifyToken } from './adminAuth.js';
import {
    getRoomByCode,
    getAllRoomsStats,
    addSpectator,
    removeSpectator,
    removeSpectatorBySocketId,
    getSpectatorCount,
    getSpectators
} from './roomManager.js';
import { getMessageHistory } from './roomHistory.js';

// 追蹤訂閱房間列表更新的管理員
const roomSubscribers = new Set();

// 追蹤觀戰者所在的房間
const spectatorRooms = new Map(); // socketId -> roomCode

/**
 * 設定後台管理 Socket 命名空間
 * @param {import('socket.io').Namespace} adminNamespace - /admin 命名空間
 * @param {import('socket.io').Server} io - 主 Socket.IO 伺服器（用於跨命名空間廣播）
 */
export function setupAdminHandler(adminNamespace, io) {
    // JWT 驗證中介軟體
    adminNamespace.use((socket, next) => {
        const token = socket.handshake.auth.token;

        // 允許未帶 token 的連線（用於登入）
        if (!token) {
            socket.isAuthenticated = false;
            return next();
        }

        const decoded = verifyToken(token);
        if (decoded) {
            socket.isAuthenticated = true;
            socket.adminUser = decoded;
            return next();
        }

        return next(new Error('驗證失敗'));
    });

    adminNamespace.on('connection', (socket) => {
        console.log(`[AdminHandler] 後台連線: ${socket.id}, 已驗證: ${socket.isAuthenticated}`);

        /**
         * 訂閱房間列表更新
         * 需要已驗證的連線
         */
        socket.on('admin_subscribe_rooms', () => {
            if (!socket.isAuthenticated) {
                socket.emit('admin_error', { error: '未授權' });
                return;
            }

            roomSubscribers.add(socket.id);
            console.log(`[AdminHandler] 管理員訂閱房間更新: ${socket.id}`);

            // 立即發送當前房間狀態
            socket.emit('admin_rooms_update', getAllRoomsStats());
        });

        /**
         * 取消訂閱房間列表更新
         */
        socket.on('admin_unsubscribe_rooms', () => {
            roomSubscribers.delete(socket.id);
            console.log(`[AdminHandler] 管理員取消訂閱: ${socket.id}`);
        });

        /**
         * 加入房間觀戰
         */
        socket.on('admin_spectate', ({ roomCode }) => {
            if (!socket.isAuthenticated) {
                socket.emit('admin_error', { error: '未授權' });
                return;
            }

            const room = getRoomByCode(roomCode);
            if (!room) {
                socket.emit('spectate_error', { error: '房間不存在' });
                return;
            }

            // 如果已經在觀戰其他房間，先離開
            const currentRoom = spectatorRooms.get(socket.id);
            if (currentRoom) {
                removeSpectator(currentRoom, socket.id);
                socket.leave(`spectate:${currentRoom}`);
            }

            // 加入新房間觀戰
            addSpectator(roomCode, socket.id);
            spectatorRooms.set(socket.id, roomCode);
            socket.join(`spectate:${roomCode}`);

            console.log(`[AdminHandler] 管理員開始觀戰: ${socket.id} -> ${roomCode}`);

            // 取得歷史訊息
            const messageHistory = getMessageHistory(roomCode);

            // 發送完整遊戲狀態（包含地雷位置）
            const spectatorState = {
                roomCode: room.code,
                gameState: room.gameState,
                hostName: room.host?.name || null,
                guestName: room.guest?.name || null,
                settings: room.settings,
                spectatorCount: getSpectatorCount(roomCode),
                game: room.game ? room.game.getSpectatorGameState() : null,
                messageHistory: messageHistory
            };

            socket.emit('spectate_joined', spectatorState);

            // 通知房間內觀戰人數變化
            broadcastSpectatorCount(io, roomCode);
        });

        /**
         * 離開觀戰
         */
        socket.on('admin_leave_spectate', () => {
            const roomCode = spectatorRooms.get(socket.id);
            if (roomCode) {
                removeSpectator(roomCode, socket.id);
                spectatorRooms.delete(socket.id);
                socket.leave(`spectate:${roomCode}`);

                console.log(`[AdminHandler] 管理員離開觀戰: ${socket.id} <- ${roomCode}`);

                // 通知房間內觀戰人數變化
                broadcastSpectatorCount(io, roomCode);
            }
        });

        /**
         * 斷線處理
         */
        socket.on('disconnect', () => {
            // 移除訂閱
            roomSubscribers.delete(socket.id);

            // 如果在觀戰，離開觀戰
            const roomCode = spectatorRooms.get(socket.id);
            if (roomCode) {
                removeSpectator(roomCode, socket.id);
                spectatorRooms.delete(socket.id);
                broadcastSpectatorCount(io, roomCode);
            }

            console.log(`[AdminHandler] 後台斷線: ${socket.id}`);
        });
    });

    console.log('[AdminHandler] 後台管理命名空間已設定');
}

/**
 * 廣播房間列表更新給所有訂閱者
 * @param {import('socket.io').Namespace} adminNamespace - /admin 命名空間
 */
export function broadcastRoomsUpdate(adminNamespace) {
    if (roomSubscribers.size === 0) return;

    const stats = getAllRoomsStats();
    for (const socketId of roomSubscribers) {
        const socket = adminNamespace.sockets.get(socketId);
        if (socket) {
            socket.emit('admin_rooms_update', stats);
        }
    }
}

/**
 * 廣播遊戲事件給觀戰者
 * @param {import('socket.io').Server} io - Socket.IO 伺服器
 * @param {string} roomCode - 房間代碼
 * @param {string} eventName - 事件名稱
 * @param {object} data - 事件資料
 */
export function broadcastToSpectators(io, roomCode, eventName, data) {
    // 廣播到後台觀戰者 (/admin 命名空間)
    const adminNamespace = io.of('/admin');
    adminNamespace.to(`spectate:${roomCode}`).emit(eventName, data);

    // 廣播到公開觀戰者 (主命名空間)
    io.to(`spectate:${roomCode}`).emit(eventName, data);
}

/**
 * 廣播觀戰人數變化
 * @param {import('socket.io').Server} io - Socket.IO 伺服器
 * @param {string} roomCode - 房間代碼
 */
export function broadcastSpectatorCount(io, roomCode) {
    const count = getSpectatorCount(roomCode);

    // 通知遊戲房間內的玩家
    io.to(roomCode).emit('spectator_count_update', { count });

    // 通知觀戰者
    const adminNamespace = io.of('/admin');
    adminNamespace.to(`spectate:${roomCode}`).emit('spectator_count_update', { count });
}

/**
 * 取得房間訂閱者數量
 */
export function getSubscribersCount() {
    return roomSubscribers.size;
}

export default {
    setupAdminHandler,
    broadcastRoomsUpdate,
    broadcastToSpectators,
    broadcastSpectatorCount,
    getSubscribersCount
};

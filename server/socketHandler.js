/**
 * WebSocket 事件處理器
 * 負責處理所有 Socket.IO 事件
 */
import { GameEngine } from './gameEngine.js';
import * as roomManager from './roomManager.js';
import * as roomHistory from './roomHistory.js';
import { broadcastToSpectators, broadcastRoomsUpdate } from './adminHandler.js';

// 儲存 io 和 adminNamespace 的參考
let ioInstance = null;
let adminNamespaceInstance = null;

// 彈幕發送頻率限制 (每人每 2 秒一則)
const danmakuCooldowns = new Map();
const DANMAKU_COOLDOWN_MS = 2000;

/**
 * 設定 Socket.IO 事件處理
 * @param {import('socket.io').Server} io - Socket.IO 伺服器實例
 * @param {import('socket.io').Namespace} adminNamespace - /admin 命名空間
 */
export function setupSocketHandlers(io, adminNamespace) {
    ioInstance = io;
    adminNamespaceInstance = adminNamespace;
    io.on('connection', (socket) => {
        console.log(`[Socket] 用戶連接: ${socket.id}`);

        /**
         * 建立房間
         */
        socket.on('create_room', (data) => {
            const { playerName, settings } = data;

            // 驗證玩家名稱
            const trimmedName = (playerName || '').trim();
            if (!trimmedName) {
                socket.emit('error', { error: '請輸入你的名稱' });
                return;
            }

            const room = roomManager.createRoom(socket.id, trimmedName, settings);

            // 加入 Socket.IO 房間
            socket.join(room.code);

            socket.emit('room_created', {
                success: true,
                roomCode: room.code,
                player: {
                    role: 'host',
                    name: room.host.name
                },
                settings: room.settings
            });

            console.log(`[Socket] 房間已建立: ${room.code}`);

            // 通知後台房間列表更新
            if (adminNamespaceInstance) {
                broadcastRoomsUpdate(adminNamespaceInstance);
            }
        });

        /**
         * 加入房間
         */
        socket.on('join_room', (data) => {
            const { roomCode, playerName } = data;

            // 驗證玩家名稱
            const trimmedName = (playerName || '').trim();
            if (!trimmedName) {
                socket.emit('join_error', { error: '請輸入你的名稱' });
                return;
            }

            // 先檢查房間是否存在
            const room = roomManager.getRoomByCode(roomCode);
            if (!room) {
                socket.emit('join_error', { error: '房間不存在' });
                return;
            }

            // 若遊戲已開始，引導用戶進入觀戰模式
            if (room.gameState === 'playing') {
                socket.emit('redirect_to_spectate', { 
                    roomCode: room.code,
                    message: '遊戲已開始，將為您開啟觀戰模式'
                });
                return;
            }

            // 若遊戲已結束，也引導用戶進入觀戰模式（等待下一局）
            if (room.gameState === 'finished') {
                socket.emit('redirect_to_spectate', { 
                    roomCode: room.code,
                    message: '遊戲已結束，將為您開啟觀戰模式等待下一局'
                });
                return;
            }

            const result = roomManager.joinRoom(roomCode, socket.id, trimmedName);

            if (!result.success) {
                socket.emit('join_error', { error: result.error });
                return;
            }

            // 加入 Socket.IO 房間
            socket.join(room.code);

            // 通知加入者
            socket.emit('room_joined', {
                success: true,
                roomCode: room.code,
                player: {
                    role: 'guest',
                    name: room.guest.name
                },
                opponent: {
                    name: room.host.name
                },
                settings: room.settings
            });

            // 通知房主有人加入
            io.to(room.host.socketId).emit('player_joined', {
                opponent: {
                    name: room.guest.name
                }
            });

            // 自動開始遊戲
            startGame(io, room);
        });

        /**
         * 揭開格子
         */
        socket.on('reveal_tile', (data) => {
            const { x, z } = data;

            const room = roomManager.getRoomBySocketId(socket.id);
            if (!room || !room.game) {
                socket.emit('error', { error: '遊戲未開始' });
                return;
            }

            const playerRole = roomManager.getPlayerRole(room.code, socket.id);
            const result = room.game.revealTile(x, z, playerRole);

            if (!result.success) {
                socket.emit('error', { error: result.error });
                return;
            }

            // 廣播揭開結果
            io.to(room.code).emit('tile_revealed', {
                x,
                z,
                player: playerRole,
                hitMine: result.hitMine,
                revealedTiles: result.revealedTiles,
                canPass: result.canPass,
                revealsThisTurn: result.revealsThisTurn,
                scores: result.scores,
                timeRemaining: result.timeRemaining,
                timerStarted: result.timerStarted
            });

            // 廣播給觀戰者（包含完整地雷資訊）
            broadcastToSpectators(io, room.code, 'tile_revealed', {
                x,
                z,
                player: playerRole,
                hitMine: result.hitMine,
                revealedTiles: result.revealedTiles,
                canPass: result.canPass,
                revealsThisTurn: result.revealsThisTurn,
                scores: result.scores,
                timeRemaining: result.timeRemaining,
                timerStarted: result.timerStarted
            });

            // 記錄遊戲動作
            roomHistory.recordGameMove(room.code, {
                type: 'reveal',
                player: playerRole,
                x,
                z,
                hitMine: result.hitMine,
                revealedCount: result.revealedTiles ? result.revealedTiles.length : 1
            });

            // 如果遊戲結束
            if (result.gameOver) {
                // 記錄輸家，下一局由輸家先手
                room.nextStartingPlayer = result.loser || (result.winner === 'host' ? 'guest' : 'host');

                // 更新對局統計
                room.matchStats.gamesPlayed++;
                if (result.winner === 'host') {
                    room.matchStats.hostWins++;
                } else if (result.winner === 'guest') {
                    room.matchStats.guestWins++;
                }

                const gameOverData = {
                    winner: result.winner,
                    loser: result.loser,
                    reason: result.hitMine ? 'hit_mine' : 'all_safe_revealed',
                    scores: result.scores,
                    allMines: result.allMines || room.game.getAllMines(),
                    matchStats: room.matchStats
                };

                io.to(room.code).emit('game_over', gameOverData);

                // 廣播給觀戰者
                broadcastToSpectators(io, room.code, 'game_over', gameOverData);

                // 記錄遊戲結束
                roomHistory.recordGameEnd(room.code, gameOverData);

                // 通知後台房間狀態更新
                if (adminNamespaceInstance) {
                    broadcastRoomsUpdate(adminNamespaceInstance);
                }

                room.gameState = 'finished';
                room.game.destroy();
            }
        });

        /**
         * 傳遞回合
         */
        socket.on('pass_turn', () => {
            const room = roomManager.getRoomBySocketId(socket.id);
            if (!room || !room.game) {
                socket.emit('error', { error: '遊戲未開始' });
                return;
            }

            const playerRole = roomManager.getPlayerRole(room.code, socket.id);
            const result = room.game.passTurn(playerRole);

            if (!result.success) {
                socket.emit('error', { error: result.error });
                return;
            }

            // 記錄傳遞回合動作
            roomHistory.recordGameMove(room.code, {
                type: 'pass',
                player: playerRole
            });

            // 廣播回合切換
            io.to(room.code).emit('turn_changed', {
                currentPlayer: result.nextPlayer,
                previousPlayer: playerRole,
                scores: result.scores,
                timeRemaining: room.game.turnTimeLimit
            });

            // 廣播給觀戰者
            broadcastToSpectators(io, room.code, 'turn_changed', {
                currentPlayer: result.nextPlayer,
                previousPlayer: playerRole,
                scores: result.scores,
                timeRemaining: room.game.turnTimeLimit
            });
        });

        /**
         * 斷線處理
         */
        socket.on('disconnect', () => {
            console.log(`[Socket] 用戶斷線: ${socket.id}`);

            // 清理彈幕冷卻記錄
            danmakuCooldowns.delete(socket.id);

            // 檢查是否為公開觀戰者
            const spectateRoomCode = roomManager.removePublicSpectatorBySocketId(socket.id);
            if (spectateRoomCode) {
                // 廣播觀戰人數更新
                broadcastSpectatorCount(io, spectateRoomCode);
                return;
            }

            const result = roomManager.leaveRoom(socket.id);

            if (result) {
                const { room, wasHost } = result;

                if (wasHost) {
                    // 房主離開，通知訪客
                    if (room.guest) {
                        io.to(room.guest.socketId).emit('game_over', {
                            winner: 'guest',
                            reason: 'opponent_disconnected',
                            message: '對手已離線，你獲勝了！'
                        });
                    }

                    // 房主離開，房間已刪除，通知觀戰者
                    broadcastToSpectators(ioInstance, room.code, 'room_closed', {
                        reason: 'host_disconnected',
                        message: '房主已離開，房間已關閉'
                    });
                } else {
                    // 訪客離開，通知房主
                    io.to(room.host.socketId).emit('game_over', {
                        winner: 'host',
                        reason: 'opponent_disconnected',
                        message: '對手已離線，你獲勝了！'
                    });

                    // 訪客離開，通知觀戰者遊戲結束
                    broadcastToSpectators(ioInstance, room.code, 'game_over', {
                        winner: 'host',
                        reason: 'opponent_disconnected',
                        message: '訪客已離線，房主獲勝'
                    });
                }

                // 清理遊戲資源
                if (room.game) {
                    room.game.destroy();
                }

                // 通知後台房間列表更新
                if (adminNamespaceInstance) {
                    broadcastRoomsUpdate(adminNamespaceInstance);
                }
            }
        });

        /**
         * 請求重新開始
         */
        socket.on('request_restart', () => {
            const room = roomManager.getRoomBySocketId(socket.id);
            console.log(`[Socket] request_restart from ${socket.id}, room:`, room ? room.code : 'null');
            if (!room) return;

            const playerRole = roomManager.getPlayerRole(room.code, socket.id);
            const opponent = roomManager.getOpponent(room.code, socket.id);
            console.log(`[Socket] playerRole: ${playerRole}, opponent:`, opponent ? opponent.socketId : 'null');

            if (opponent) {
                io.to(opponent.socketId).emit('restart_requested', {
                    from: playerRole
                });
                console.log(`[Socket] restart_requested sent to ${opponent.socketId}`);
            }
        });

        /**
         * 接受重新開始
         */
        socket.on('accept_restart', () => {
            const room = roomManager.getRoomBySocketId(socket.id);
            console.log(`[Socket] accept_restart from ${socket.id}, room:`, room ? room.code : 'null');
            if (!room || !room.guest) return;

            // 重新開始遊戲
            startGame(io, room);
        });

        /**
         * 公開觀戰 - 加入觀戰
         */
        socket.on('public_spectate', ({ roomCode }) => {
            const room = roomManager.getRoomByCode(roomCode);

            if (!room) {
                socket.emit('spectate_error', { error: '房間不存在' });
                return;
            }

            // 加入觀戰（只要房間存在就可以觀戰，包括遊戲結束後）
            roomManager.addPublicSpectator(roomCode, socket.id);

            // 加入 Socket.IO 房間 (只加入觀戰專用房間，避免重複接收訊息)
            socket.join(`spectate:${roomCode}`);

            // 標記此 socket 為公開觀戰者
            socket.spectateRoomCode = roomCode;

            // 取得歷史訊息
            const messageHistory = roomHistory.getMessageHistory(roomCode);

            // 回傳遊戲狀態 (使用玩家視角，不含地雷位置)
            socket.emit('spectate_joined', {
                roomCode: room.code,
                hostName: room.host?.name,
                guestName: room.guest?.name,
                spectatorCount: roomManager.getSpectatorCount(roomCode),
                gameState: room.gameState,
                game: room.game ? room.game.getGameState() : null,
                matchStats: room.matchStats,
                messageHistory: messageHistory
            });

            // 廣播觀戰人數更新
            broadcastSpectatorCount(io, roomCode);

            console.log(`[Socket] 公開觀戰者加入: ${roomCode}, socket: ${socket.id}`);
        });

        /**
         * 離開觀戰
         */
        socket.on('leave_spectate', () => {
            if (socket.spectateRoomCode) {
                const roomCode = socket.spectateRoomCode;
                roomManager.removePublicSpectator(roomCode, socket.id);
                socket.leave(`spectate:${roomCode}`);
                socket.spectateRoomCode = null;

                // 廣播觀戰人數更新
                broadcastSpectatorCount(io, roomCode);
            }
        });

        /**
         * 發送彈幕
         */
        socket.on('send_danmaku', ({ roomCode, message, nickname, isPlayer }) => {
            // 驗證房間存在
            const room = roomManager.getRoomByCode(roomCode);
            if (!room) return;

            // 檢查發送頻率
            const now = Date.now();
            const lastSendTime = danmakuCooldowns.get(socket.id) || 0;
            if (now - lastSendTime < DANMAKU_COOLDOWN_MS) {
                return; // 靜默忽略，前端已有提示
            }
            danmakuCooldowns.set(socket.id, now);

            // 驗證訊息
            if (!message || typeof message !== 'string') return;
            const trimmedMessage = message.trim().substring(0, 50);
            if (trimmedMessage.length === 0) return;

            // 處理暱稱
            const safeNickname = (nickname && typeof nickname === 'string')
                ? nickname.trim().substring(0, 10) || '匿名觀眾'
                : '匿名觀眾';

            // 建立彈幕資料
            const danmakuData = {
                id: `${socket.id}-${now}`,
                nickname: safeNickname,
                message: trimmedMessage,
                timestamp: now,
                isPlayer: !!isPlayer
            };

            // 記錄訊息到歷史
            roomHistory.recordMessage(roomCode, danmakuData);

            // 廣播給房間內所有人 (玩家 + 公開觀戰者)
            io.to(roomCode).emit('danmaku', danmakuData);

            // 廣播給管理員觀戰者
            broadcastToSpectators(io, roomCode, 'danmaku', danmakuData);

            console.log(`[Socket] 彈幕: [${safeNickname}] ${trimmedMessage} (房間: ${roomCode})`);
        });

        /**
         * 更新玩家名稱
         */
        socket.on('update_player_name', ({ newName }) => {
            if (!newName || typeof newName !== 'string') return;

            const trimmedName = newName.trim().substring(0, 10);
            if (!trimmedName) return;

            const room = roomManager.getRoomBySocketId(socket.id);
            if (!room) return;

            const playerRole = roomManager.getPlayerRole(room.code, socket.id);
            if (!playerRole) return;

            // 更新房間中的玩家名稱
            if (playerRole === 'host' && room.host) {
                room.host.name = trimmedName;
            } else if (playerRole === 'guest' && room.guest) {
                room.guest.name = trimmedName;
            }

            // 廣播給房間內所有人（包括自己，以便確認更新）
            io.to(room.code).emit('player_name_updated', {
                role: playerRole,
                newName: trimmedName
            });

            // 廣播給觀戰者
            broadcastToSpectators(io, room.code, 'player_name_updated', {
                role: playerRole,
                newName: trimmedName
            });

            console.log(`[Socket] 玩家名稱更新: ${playerRole} -> ${trimmedName} (房間: ${room.code})`);
        });
    });
}

/**
 * 開始遊戲
 */
function startGame(io, room) {
    // 決定先手玩家（預設 host，但如果有記錄則用上一局輸家）
    const startingPlayer = room.nextStartingPlayer || 'host';

    // 建立遊戲引擎
    room.game = new GameEngine(
        {
            ...room.settings,
            startingPlayer: startingPlayer
        },
        // 計時器更新回調
        (timeRemaining) => {
            io.to(room.code).emit('timer_update', { timeRemaining });
            // 同時通知觀戰者
            broadcastToSpectators(ioInstance, room.code, 'timer_update', { timeRemaining });
        },
        // 回合超時回調
        () => {
            handleTimeout(io, room);
        }
    );

    // 生成網格
    const grid = room.game.generateGrid();

    // 更新房間狀態
    room.gameState = 'playing';
    room.gameStartedAt = Date.now(); // 記錄遊戲開始時間

    // 記錄遊戲開始
    roomHistory.recordGameStart(room.code, {
        startingPlayer,
        settings: room.settings
    });

    // 不啟動計時器，等待第一次點擊後才開始計時

    // 通知雙方遊戲開始
    io.to(room.code).emit('game_start', {
        grid,
        gridSize: room.settings.gridSize,
        minesCount: room.settings.minesCount,
        currentPlayer: startingPlayer,
        turnTimeLimit: room.settings.turnTimeLimit,
        timeRemaining: null, // 開局時不顯示時間
        isFirstMove: true,
        host: {
            name: room.host.name
        },
        guest: {
            name: room.guest.name
        },
        matchStats: room.matchStats
    });

    // 通知觀戰者遊戲開始（包含完整地雷資訊）
    broadcastToSpectators(ioInstance, room.code, 'game_start', {
        grid: room.game.getFullGridForSpectator(),
        gridSize: room.settings.gridSize,
        minesCount: room.settings.minesCount,
        currentPlayer: startingPlayer,
        turnTimeLimit: room.settings.turnTimeLimit,
        timeRemaining: null, // 開局時不顯示時間
        isFirstMove: true,
        host: {
            name: room.host.name
        },
        guest: {
            name: room.guest.name
        },
        matchStats: room.matchStats
    });

    // 通知後台房間狀態更新
    if (adminNamespaceInstance) {
        broadcastRoomsUpdate(adminNamespaceInstance);
    }

    console.log(`[Socket] 遊戲開始: ${room.code}`);
}

/**
 * 處理回合超時
 */
function handleTimeout(io, room) {
    if (!room.game || room.game.gameStatus !== 'playing') return;

    const result = room.game.handleTimeout();

    // 如果遊戲結束（超時沒有點擊任何格子）
    if (result.gameOver) {
        // 記錄輸家，下一局由輸家先手
        room.nextStartingPlayer = result.loser || (result.winner === 'host' ? 'guest' : 'host');

        // 更新對局統計
        room.matchStats.gamesPlayed++;
        if (result.winner === 'host') {
            room.matchStats.hostWins++;
        } else if (result.winner === 'guest') {
            room.matchStats.guestWins++;
        }

        const gameOverData = {
            winner: result.winner,
            loser: result.loser,
            reason: result.reason || 'timeout_no_action',
            scores: result.scores,
            allMines: result.allMines || room.game.getAllMines(),
            matchStats: room.matchStats
        };

        io.to(room.code).emit('game_over', gameOverData);

        // 廣播給觀戰者
        broadcastToSpectators(ioInstance, room.code, 'game_over', gameOverData);

        // 記錄遊戲結束
        roomHistory.recordGameEnd(room.code, gameOverData);

        // 通知後台房間狀態更新
        if (adminNamespaceInstance) {
            broadcastRoomsUpdate(adminNamespaceInstance);
        }

        room.gameState = 'finished';
        room.game.destroy();
    } else {
        // 記錄超時自動傳遞
        roomHistory.recordGameMove(room.code, {
            type: 'timeout_auto_pass',
            player: result.nextPlayer === 'host' ? 'guest' : 'host'
        });

        // 自動傳遞回合（有揭開格子但未傳遞）
        io.to(room.code).emit('timeout_action', {
            player: result.nextPlayer === 'host' ? 'guest' : 'host',
            autoPassed: result.autoPassed,
            nextPlayer: result.nextPlayer,
            timeRemaining: room.game.turnTimeLimit,
            scores: result.scores
        });

        // 廣播給觀戰者
        broadcastToSpectators(ioInstance, room.code, 'timeout_action', {
            player: result.nextPlayer === 'host' ? 'guest' : 'host',
            autoPassed: result.autoPassed,
            nextPlayer: result.nextPlayer,
            timeRemaining: room.game.turnTimeLimit,
            scores: result.scores
        });

        // 通知回合切換
        io.to(room.code).emit('turn_changed', {
            currentPlayer: result.nextPlayer,
            previousPlayer: result.nextPlayer === 'host' ? 'guest' : 'host',
            reason: 'timeout_auto_pass',
            timeRemaining: room.game.turnTimeLimit
        });

        // 廣播給觀戰者
        broadcastToSpectators(ioInstance, room.code, 'turn_changed', {
            currentPlayer: result.nextPlayer,
            previousPlayer: result.nextPlayer === 'host' ? 'guest' : 'host',
            reason: 'timeout_auto_pass',
            timeRemaining: room.game.turnTimeLimit
        });
    }
}

export default { setupSocketHandlers };

/**
 * 廣播觀戰人數更新
 * @param {import('socket.io').Server} io
 * @param {string} roomCode
 */
function broadcastSpectatorCount(io, roomCode) {
    const count = roomManager.getSpectatorCount(roomCode);

    // 廣播給房間內玩家和公開觀戰者
    io.to(roomCode).emit('spectator_count_update', { count });

    // 廣播給管理員觀戰者
    if (adminNamespaceInstance) {
        adminNamespaceInstance.to(`spectate:${roomCode}`).emit('spectator_count_update', { count });
    }
}

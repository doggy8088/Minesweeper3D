/**
 * WebSocket 事件處理器
 * 負責處理所有 Socket.IO 事件
 */
import { GameEngine } from './gameEngine.js';
import * as roomManager from './roomManager.js';
import { broadcastToSpectators, broadcastRoomsUpdate } from './adminHandler.js';

// 儲存 io 和 adminNamespace 的參考
let ioInstance = null;
let adminNamespaceInstance = null;

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

            const room = roomManager.createRoom(socket.id, playerName, settings);

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

            const result = roomManager.joinRoom(roomCode, socket.id, playerName);

            if (!result.success) {
                socket.emit('join_error', { error: result.error });
                return;
            }

            const room = result.room;

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
                timeRemaining: room.game.timeRemaining
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
                timeRemaining: room.game.timeRemaining
            });

            // 如果遊戲結束
            if (result.gameOver) {
                // 記錄輸家，下一局由輸家先手
                room.nextStartingPlayer = result.loser || (result.winner === 'host' ? 'guest' : 'host');

                const gameOverData = {
                    winner: result.winner,
                    loser: result.loser,
                    reason: result.hitMine ? 'hit_mine' : 'all_safe_revealed',
                    scores: result.scores,
                    allMines: result.allMines || room.game.getAllMines()
                };

                io.to(room.code).emit('game_over', gameOverData);

                // 廣播給觀戰者
                broadcastToSpectators(io, room.code, 'game_over', gameOverData);

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
                } else {
                    // 訪客離開，通知房主
                    io.to(room.host.socketId).emit('game_over', {
                        winner: 'host',
                        reason: 'opponent_disconnected',
                        message: '對手已離線，你獲勝了！'
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
            if (!room) return;

            const playerRole = roomManager.getPlayerRole(room.code, socket.id);
            const opponent = roomManager.getOpponent(room.code, socket.id);

            if (opponent) {
                io.to(opponent.socketId).emit('restart_requested', {
                    from: playerRole
                });
            }
        });

        /**
         * 接受重新開始
         */
        socket.on('accept_restart', () => {
            const room = roomManager.getRoomBySocketId(socket.id);
            if (!room || !room.guest) return;

            // 重新開始遊戲
            startGame(io, room);
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

    // 啟動計時器
    room.game.startTimer();

    // 通知雙方遊戲開始
    io.to(room.code).emit('game_start', {
        grid,
        gridSize: room.settings.gridSize,
        minesCount: room.settings.minesCount,
        currentPlayer: startingPlayer,
        turnTimeLimit: room.settings.turnTimeLimit,
        timeRemaining: room.settings.turnTimeLimit,
        host: {
            name: room.host.name
        },
        guest: {
            name: room.guest.name
        }
    });

    // 通知觀戰者遊戲開始（包含完整地雷資訊）
    broadcastToSpectators(ioInstance, room.code, 'game_start', {
        grid: room.game.getFullGridForSpectator(),
        gridSize: room.settings.gridSize,
        minesCount: room.settings.minesCount,
        currentPlayer: startingPlayer,
        turnTimeLimit: room.settings.turnTimeLimit,
        timeRemaining: room.settings.turnTimeLimit,
        host: {
            name: room.host.name
        },
        guest: {
            name: room.guest.name
        }
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

    // 廣播超時結果
    io.to(room.code).emit('timeout_action', {
        player: result.nextPlayer === 'host' ? 'guest' : 'host',
        autoRevealed: result.autoRevealed,
        revealedTiles: result.revealedTiles,
        hitMine: result.hitMine,
        nextPlayer: result.nextPlayer,
        timeRemaining: room.game.turnTimeLimit
    });

    // 廣播給觀戰者
    broadcastToSpectators(ioInstance, room.code, 'timeout_action', {
        player: result.nextPlayer === 'host' ? 'guest' : 'host',
        autoRevealed: result.autoRevealed,
        revealedTiles: result.revealedTiles,
        hitMine: result.hitMine,
        nextPlayer: result.nextPlayer,
        timeRemaining: room.game.turnTimeLimit
    });

    // 如果遊戲結束
    if (result.gameOver) {
        // 記錄輸家，下一局由輸家先手
        room.nextStartingPlayer = result.loser || (result.winner === 'host' ? 'guest' : 'host');

        const gameOverData = {
            winner: result.winner,
            loser: result.loser,
            reason: 'timeout_hit_mine',
            scores: result.scores,
            allMines: result.allMines || room.game.getAllMines()
        };

        io.to(room.code).emit('game_over', gameOverData);

        // 廣播給觀戰者
        broadcastToSpectators(ioInstance, room.code, 'game_over', gameOverData);

        // 通知後台房間狀態更新
        if (adminNamespaceInstance) {
            broadcastRoomsUpdate(adminNamespaceInstance);
        }

        room.gameState = 'finished';
        room.game.destroy();
    } else {
        // 通知回合切換
        io.to(room.code).emit('turn_changed', {
            currentPlayer: result.nextPlayer,
            previousPlayer: result.nextPlayer === 'host' ? 'guest' : 'host',
            reason: 'timeout',
            timeRemaining: room.game.turnTimeLimit
        });

        // 廣播給觀戰者
        broadcastToSpectators(ioInstance, room.code, 'turn_changed', {
            currentPlayer: result.nextPlayer,
            previousPlayer: result.nextPlayer === 'host' ? 'guest' : 'host',
            reason: 'timeout',
            timeRemaining: room.game.turnTimeLimit
        });
    }
}

export default { setupSocketHandlers };

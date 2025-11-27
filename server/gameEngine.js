/**
 * 遊戲邏輯引擎
 * 負責遊戲狀態管理、回合邏輯、勝負判定
 */
import { CONFIG } from './config.js';

export class GameEngine {
    /**
     * @param {object} settings - 遊戲設定
     * @param {function} onTimerUpdate - 計時器更新回調
     * @param {function} onTurnTimeout - 回合超時回調
     */
    constructor(settings, onTimerUpdate, onTurnTimeout) {
        this.gridSize = settings.gridSize || CONFIG.GRID_SIZE;
        this.minesCount = settings.minesCount || CONFIG.DEFAULT_MINES_COUNT;
        this.turnTimeLimit = settings.turnTimeLimit || CONFIG.TURN_TIME_LIMIT;

        this.grid = [];
        this.startingPlayer = settings.startingPlayer || 'host'; // 先手玩家
        this.currentPlayer = this.startingPlayer;
        this.revealsThisTurn = 0; // 本回合揭開的格子數
        this.totalRevealed = 0; // 總共揭開的格子數
        this.gameStatus = 'waiting'; // waiting, playing, finished
        this.winner = null;
        this.lastPassedBy = null; // 記錄最後傳遞回合的玩家

        // 第一次點擊相關
        this.isFirstMove = true; // 是否為第一次點擊
        this.minesPlaced = false; // 地雷是否已佈置

        // 計時器（第一次點擊後才會啟動）
        this.turnTimer = null;
        this.timeRemaining = null; // 開局時不顯示時間
        this.onTimerUpdate = onTimerUpdate;
        this.onTurnTimeout = onTurnTimeout;

        // 玩家分數
        this.scores = {
            host: 0,
            guest: 0
        };
    }

    /**
     * 生成遊戲網格（只初始化空網格，地雷在第一次點擊後才佈置）
     */
    generateGrid() {
        // 初始化空網格
        this.grid = [];
        for (let x = 0; x < this.gridSize; x++) {
            this.grid[x] = [];
            for (let z = 0; z < this.gridSize; z++) {
                this.grid[x][z] = {
                    x,
                    z,
                    isMine: false,
                    isRevealed: false,
                    neighborMines: 0
                };
            }
        }

        // 地雷將在第一次點擊時佈置
        this.minesPlaced = false;
        this.isFirstMove = true;

        this.gameStatus = 'playing';
        this.currentPlayer = this.startingPlayer;
        this.revealsThisTurn = 0;
        this.totalRevealed = 0;

        console.log(`[GameEngine] 空網格已生成: ${this.gridSize}x${this.gridSize}, 地雷將在第一次點擊後佈置`);

        return this.getClientGrid();
    }

    /**
     * 佈置地雷（在第一次點擊時呼叫，確保點擊位置及周圍安全）
     * @param {number} safeX - 安全區域中心 X 座標
     * @param {number} safeZ - 安全區域中心 Z 座標
     */
    placeMines(safeX, safeZ) {
        // 建立安全區域（點擊位置及其周圍 8 格）
        const safeZone = new Set();
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const nx = safeX + dx;
                const nz = safeZ + dz;
                if (nx >= 0 && nx < this.gridSize && nz >= 0 && nz < this.gridSize) {
                    safeZone.add(`${nx},${nz}`);
                }
            }
        }

        // 佈置地雷（避開安全區域）
        let placedMines = 0;
        const maxAttempts = this.gridSize * this.gridSize * 10;
        let attempts = 0;

        while (placedMines < this.minesCount && attempts < maxAttempts) {
            const x = Math.floor(Math.random() * this.gridSize);
            const z = Math.floor(Math.random() * this.gridSize);
            attempts++;

            // 跳過安全區域和已有地雷的格子
            if (safeZone.has(`${x},${z}`) || this.grid[x][z].isMine) {
                continue;
            }

            this.grid[x][z].isMine = true;
            placedMines++;
        }

        // 計算鄰居地雷數
        for (let x = 0; x < this.gridSize; x++) {
            for (let z = 0; z < this.gridSize; z++) {
                if (!this.grid[x][z].isMine) {
                    this.grid[x][z].neighborMines = this.countNeighborMines(x, z);
                }
            }
        }

        this.minesPlaced = true;
        console.log(`[GameEngine] 地雷已佈置: ${placedMines} 顆，安全區域中心: (${safeX}, ${safeZ})`);
    }

    /**
     * 計算指定位置周圍的地雷數
     */
    countNeighborMines(x, z) {
        let count = 0;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) continue;
                const nx = x + dx;
                const nz = z + dz;
                if (nx >= 0 && nx < this.gridSize && nz >= 0 && nz < this.gridSize) {
                    if (this.grid[nx][nz].isMine) count++;
                }
            }
        }
        return count;
    }

    /**
     * 揭開格子
     * @param {number} x - X 座標
     * @param {number} z - Z 座標
     * @param {string} player - 執行操作的玩家 ('host' 或 'guest')
     * @returns {object} 操作結果
     */
    revealTile(x, z, player) {
        // 驗證遊戲狀態
        if (this.gameStatus !== 'playing') {
            return { success: false, error: '遊戲未進行中' };
        }

        // 驗證是否輪到該玩家
        if (player !== this.currentPlayer) {
            return { success: false, error: '不是你的回合' };
        }

        // 驗證座標
        if (x < 0 || x >= this.gridSize || z < 0 || z >= this.gridSize) {
            return { success: false, error: '無效的座標' };
        }

        const tile = this.grid[x][z];

        // 檢查是否已揭開
        if (tile.isRevealed) {
            return { success: false, error: '該格子已揭開' };
        }

        // 第一次點擊時佈置地雷（確保點擊位置及周圍安全）
        const isFirstMove = this.isFirstMove;
        if (!this.minesPlaced) {
            this.placeMines(x, z);
        }

        // 執行揭開
        const revealedTiles = this.doReveal(x, z);
        this.revealsThisTurn += revealedTiles.length;
        this.totalRevealed += revealedTiles.length;

        // 計分：第一下開局的格子不計分
        if (!isFirstMove) {
            this.scores[player] += revealedTiles.length * 10;
        }

        // 第一次移動完成後，啟動計時器
        if (this.isFirstMove) {
            this.isFirstMove = false;
            this.startTimer();
        }

        // 檢查是否踩到地雷（第一下不可能踩到）
        if (tile.isMine) {
            this.gameStatus = 'finished';
            this.winner = player === 'host' ? 'guest' : 'host';
            this.stopTimer();

            return {
                success: true,
                hitMine: true,
                revealedTiles,
                gameOver: true,
                winner: this.winner,
                loser: player,
                scores: this.scores,
                allMines: this.getAllMines()
            };
        }

        // 檢查是否所有安全格都已揭開（勝利條件）
        const winCheck = this.checkWinCondition();
        if (winCheck.isWin) {
            this.gameStatus = 'finished';
            // 最後傳遞回合的玩家獲勝；若無人傳遞過（只有第一回合就全部揭開），則當前玩家獲勝
            this.winner = this.lastPassedBy || player;
            this.stopTimer();

            return {
                success: true,
                hitMine: false,
                revealedTiles,
                gameOver: true,
                winner: this.winner,
                reason: 'all_safe_revealed',
                scores: this.scores
            };
        }

        // 開局後切換到正常回合時間（計時器已在上面啟動）

        return {
            success: true,
            hitMine: false,
            revealedTiles,
            gameOver: false,
            canPass: this.revealsThisTurn >= CONFIG.MIN_REVEALS_TO_PASS,
            revealsThisTurn: this.revealsThisTurn,
            scores: this.scores,
            timerStarted: isFirstMove, // 標記是否剛啟動計時器
            timeRemaining: this.timeRemaining
        };
    }

    /**
     * 執行揭開操作（包含自動展開）
     */
    doReveal(x, z) {
        const tile = this.grid[x][z];
        if (tile.isRevealed) return [];

        tile.isRevealed = true;
        const revealedTiles = [{
            x,
            z,
            isMine: tile.isMine,
            neighborMines: tile.neighborMines
        }];

        // 如果是 0，自動展開周圍
        if (!tile.isMine && tile.neighborMines === 0) {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dz === 0) continue;
                    const nx = x + dx;
                    const nz = z + dz;
                    if (nx >= 0 && nx < this.gridSize && nz >= 0 && nz < this.gridSize) {
                        const neighborRevealed = this.doReveal(nx, nz);
                        revealedTiles.push(...neighborRevealed);
                    }
                }
            }
        }

        return revealedTiles;
    }

    /**
     * 傳遞回合
     * @param {string} player - 執行操作的玩家
     * @returns {object} 操作結果
     */
    passTurn(player) {
        if (this.gameStatus !== 'playing') {
            return { success: false, error: '遊戲未進行中' };
        }

        if (player !== this.currentPlayer) {
            return { success: false, error: '不是你的回合' };
        }

        if (this.revealsThisTurn < CONFIG.MIN_REVEALS_TO_PASS) {
            return {
                success: false,
                error: `需要至少揭開 ${CONFIG.MIN_REVEALS_TO_PASS} 格才能傳遞回合`
            };
        }

        // 記錄傳遞者
        this.lastPassedBy = player;

        // 切換玩家
        this.currentPlayer = player === 'host' ? 'guest' : 'host';
        this.revealsThisTurn = 0;

        // 重置計時器
        this.resetTimer();

        console.log(`[GameEngine] 回合傳遞: ${player} -> ${this.currentPlayer}`);

        return {
            success: true,
            nextPlayer: this.currentPlayer,
            scores: this.scores
        };
    }

    /**
     * 檢查勝利條件
     */
    checkWinCondition() {
        const totalTiles = this.gridSize * this.gridSize;
        const safeTiles = totalTiles - this.minesCount;

        if (this.totalRevealed >= safeTiles) {
            return { isWin: true };
        }

        return { isWin: false };
    }

    /**
     * 取得所有安全且未揭開的格子
     */
    getSafeTiles() {
        const safeTiles = [];
        for (let x = 0; x < this.gridSize; x++) {
            for (let z = 0; z < this.gridSize; z++) {
                const tile = this.grid[x][z];
                if (!tile.isMine && !tile.isRevealed) {
                    safeTiles.push({ x, z });
                }
            }
        }
        return safeTiles;
    }

    /**
     * 取得所有未揭開的格子
     */
    getUnrevealedTiles() {
        const tiles = [];
        for (let x = 0; x < this.gridSize; x++) {
            for (let z = 0; z < this.gridSize; z++) {
                if (!this.grid[x][z].isRevealed) {
                    tiles.push({ x, z, isMine: this.grid[x][z].isMine });
                }
            }
        }
        return tiles;
    }

    /**
     * 取得所有地雷位置
     */
    getAllMines() {
        const mines = [];
        for (let x = 0; x < this.gridSize; x++) {
            for (let z = 0; z < this.gridSize; z++) {
                if (this.grid[x][z].isMine) {
                    mines.push({ x, z });
                }
            }
        }
        return mines;
    }

    /**
     * 回合超時處理
     */
    handleTimeout() {
        const player = this.currentPlayer;

        // 回合內沒有揭開任何格子 = 判輸
        if (this.revealsThisTurn === 0) {
            this.gameStatus = 'finished';
            this.winner = player === 'host' ? 'guest' : 'host';
            this.stopTimer();

            return {
                timeout: true,
                gameOver: true,
                winner: this.winner,
                loser: player,
                reason: 'timeout_no_action',
                scores: this.scores,
                allMines: this.getAllMines()
            };
        }

        // 有揭開格子但未傳遞：自動傳遞回合
        this.lastPassedBy = player;
        this.currentPlayer = player === 'host' ? 'guest' : 'host';
        this.revealsThisTurn = 0;
        this.resetTimer();

        console.log(`[GameEngine] 超時自動傳遞: ${player} -> ${this.currentPlayer}`);

        return {
            timeout: true,
            gameOver: false,
            autoPassed: true,
            nextPlayer: this.currentPlayer,
            scores: this.scores,
            timeRemaining: this.timeRemaining
        };
    }

    /**
     * 啟動回合計時器
     */
    startTimer() {
        this.timeRemaining = this.turnTimeLimit;

        if (this.turnTimer) {
            clearInterval(this.turnTimer);
        }

        this.turnTimer = setInterval(() => {
            this.timeRemaining--;

            if (this.onTimerUpdate) {
                this.onTimerUpdate(this.timeRemaining);
            }

            if (this.timeRemaining <= 0) {
                this.stopTimer();
                if (this.onTurnTimeout) {
                    this.onTurnTimeout();
                }
            }
        }, 1000);

        console.log(`[GameEngine] 計時器啟動: ${this.turnTimeLimit}秒`);
    }

    /**
     * 重置計時器
     */
    resetTimer() {
        this.timeRemaining = this.turnTimeLimit;

        if (this.onTimerUpdate) {
            this.onTimerUpdate(this.timeRemaining);
        }

        // 如果計時器沒有運行，啟動它
        if (!this.turnTimer) {
            this.startTimer();
        }
    }

    /**
     * 停止計時器
     */
    stopTimer() {
        if (this.turnTimer) {
            clearInterval(this.turnTimer);
            this.turnTimer = null;
        }
    }

    /**
     * 取得客戶端用的網格（隱藏未揭開格子的地雷資訊）
     */
    getClientGrid() {
        const clientGrid = [];
        for (let x = 0; x < this.gridSize; x++) {
            clientGrid[x] = [];
            for (let z = 0; z < this.gridSize; z++) {
                const tile = this.grid[x][z];
                clientGrid[x][z] = {
                    x,
                    z,
                    isRevealed: tile.isRevealed,
                    // 只有已揭開的格子才顯示詳細資訊
                    isMine: tile.isRevealed ? tile.isMine : undefined,
                    neighborMines: tile.isRevealed ? tile.neighborMines : undefined
                };
            }
        }
        return clientGrid;
    }

    /**
     * 取得觀戰者用的完整網格（顯示所有地雷位置，上帝視角）
     */
    getFullGridForSpectator() {
        const fullGrid = [];
        for (let x = 0; x < this.gridSize; x++) {
            fullGrid[x] = [];
            for (let z = 0; z < this.gridSize; z++) {
                const tile = this.grid[x][z];
                fullGrid[x][z] = {
                    x,
                    z,
                    isRevealed: tile.isRevealed,
                    isMine: tile.isMine, // 觀戰者可看到所有地雷
                    neighborMines: tile.neighborMines
                };
            }
        }
        return fullGrid;
    }

    /**
     * 取得觀戰者用的完整遊戲狀態
     */
    getSpectatorGameState() {
        return {
            gridSize: this.gridSize,
            minesCount: this.minesCount,
            currentPlayer: this.currentPlayer,
            revealsThisTurn: this.revealsThisTurn,
            totalRevealed: this.totalRevealed,
            gameStatus: this.gameStatus,
            winner: this.winner,
            timeRemaining: this.timeRemaining,
            turnTimeLimit: this.turnTimeLimit,
            isFirstMove: this.isFirstMove,
            canPass: this.revealsThisTurn >= CONFIG.MIN_REVEALS_TO_PASS,
            scores: this.scores,
            grid: this.getFullGridForSpectator() // 觀戰者獲得完整網格
        };
    }

    /**
     * 取得遊戲狀態
     */
    getGameState() {
        return {
            gridSize: this.gridSize,
            minesCount: this.minesCount,
            currentPlayer: this.currentPlayer,
            revealsThisTurn: this.revealsThisTurn,
            totalRevealed: this.totalRevealed,
            gameStatus: this.gameStatus,
            winner: this.winner,
            timeRemaining: this.timeRemaining,
            turnTimeLimit: this.turnTimeLimit,
            isFirstMove: this.isFirstMove,
            canPass: this.revealsThisTurn >= CONFIG.MIN_REVEALS_TO_PASS,
            scores: this.scores,
            grid: this.getClientGrid()
        };
    }

    /**
     * 清理資源
     */
    destroy() {
        this.stopTimer();
    }
}

export default GameEngine;

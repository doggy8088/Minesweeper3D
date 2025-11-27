/**
 * 公開觀戰前端邏輯
 * 提供 3D 觀戰渲染與彈幕功能
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

// ==========================================
// 常數設定
// ==========================================
const TILE_SIZE = 2;
const TILE_SPACING = 0.2;

const COLORS = {
    GRASS: 0x4CAF50,
    DIRT: 0xD7CCC8,
    TEXT: 0x333333
};

// ==========================================
// 觀戰渲染器類別
// ==========================================
class WatchRenderer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.font = null;
        this.tiles = [];
        this.particles = [];
        this.gridSize = 10;

        this.materials = {
            grass: new THREE.MeshStandardMaterial({ color: COLORS.GRASS, roughness: 0.8 }),
            dirt: new THREE.MeshStandardMaterial({ color: COLORS.DIRT, roughness: 0.9 }),
        };
    }

    async init() {
        const container = document.getElementById('game-canvas-container');

        // 場景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 20, 60);

        // 相機
        const rect = container.getBoundingClientRect();
        this.camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 1000);
        this.camera.position.set(0, 25, 20);
        this.camera.lookAt(0, 0, 0);

        // 渲染器
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(rect.width, rect.height);
        this.renderer.shadowMap.enabled = true;
        container.appendChild(this.renderer.domElement);

        // 燈光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        // 控制器
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.1;

        // 載入字型
        await this.loadFont();

        // 視窗大小變化
        window.addEventListener('resize', () => this.onWindowResize());

        // 開始渲染
        this.animate();
    }

    loadFont() {
        return new Promise((resolve) => {
            const loader = new FontLoader();
            loader.load('https://unpkg.com/three@0.154.0/examples/fonts/helvetiker_bold.typeface.json', (font) => {
                this.font = font;
                resolve();
            });
        });
    }

    onWindowResize() {
        const container = document.getElementById('game-canvas-container');
        const rect = container.getBoundingClientRect();
        this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(rect.width, rect.height);
    }

    animate() {
        if (!this.renderer) return;

        requestAnimationFrame(() => this.animate());
        this.controls?.update();

        // 更新粒子
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.mesh.position.y += p.speedY;
            p.mesh.position.x += p.speedX;
            p.mesh.position.z += p.speedZ;

            p.speedY -= 0.01;
            p.life -= 0.02;
            p.mesh.material.opacity = p.life;
            p.mesh.scale.multiplyScalar(0.95);

            if (p.mesh.material.opacity <= 0) {
                this.scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                this.particles.splice(i, 1);
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    createGrid(gridSize) {
        this.gridSize = gridSize;
        this.tiles = [];

        // 清除場景
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }

        // 重新添加燈光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        const offset = (gridSize * (TILE_SIZE + TILE_SPACING)) / 2 - (TILE_SIZE + TILE_SPACING) / 2;

        for (let x = 0; x < gridSize; x++) {
            this.tiles[x] = [];
            for (let z = 0; z < gridSize; z++) {
                const geometry = new THREE.BoxGeometry(TILE_SIZE, 0.5, TILE_SIZE);
                const mesh = new THREE.Mesh(geometry, this.materials.grass.clone());

                const posX = x * (TILE_SIZE + TILE_SPACING) - offset;
                const posZ = z * (TILE_SIZE + TILE_SPACING) - offset;

                mesh.position.set(posX, 0.25, posZ);
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                this.scene.add(mesh);

                // 底座
                const baseGeo = new THREE.BoxGeometry(TILE_SIZE, 0.1, TILE_SIZE);
                const baseMesh = new THREE.Mesh(baseGeo, this.materials.dirt);
                baseMesh.position.set(posX, 0.05, posZ);
                baseMesh.receiveShadow = true;
                this.scene.add(baseMesh);

                this.tiles[x][z] = {
                    mesh,
                    baseMesh,
                    posX,
                    posZ,
                    isRevealed: false
                };
            }
        }

        // 地面
        const groundSize = gridSize * (TILE_SIZE + TILE_SPACING) + 2;
        const groundGeo = new THREE.BoxGeometry(groundSize, 0.1, groundSize);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x8BC34A });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.y = -0.1;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    revealTile(x, z, isMine, neighborMines) {
        if (!this.tiles[x] || !this.tiles[x][z]) return;

        const tile = this.tiles[x][z];
        if (tile.isRevealed) return;

        tile.isRevealed = true;
        tile.mesh.visible = false;

        if (isMine) {
            this.createMine(tile.posX, tile.posZ);
        } else if (neighborMines > 0) {
            this.createNumber(tile.posX, tile.posZ, neighborMines);
        }
    }

    revealMultipleTiles(tiles) {
        tiles.forEach(tile => {
            this.revealTile(tile.x, tile.z, tile.isMine, tile.neighborMines);
        });
    }

    createMine(x, z) {
        const group = new THREE.Group();

        // 炸彈本體
        const bodyGeo = new THREE.SphereGeometry(0.45, 32, 32);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.3,
            metalness: 0.7
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        group.add(body);

        // 引信座
        const capGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.1, 16);
        const capMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5, metalness: 0.5 });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = 0.4;
        group.add(cap);

        // 引信
        const fuseGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.25, 8);
        const fuseMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const fuse = new THREE.Mesh(fuseGeo, fuseMat);
        fuse.position.y = 0.55;
        group.add(fuse);

        // 火花
        const sparkGeo = new THREE.SphereGeometry(0.06, 8, 8);
        const sparkMat = new THREE.MeshBasicMaterial({ color: 0xFF5722 });
        const spark = new THREE.Mesh(sparkGeo, sparkMat);
        spark.position.y = 0.68;
        group.add(spark);

        group.position.set(x, 0.5, z);
        this.scene.add(group);

        // 爆炸特效
        this.createExplosion(x, z);

        // 動畫
        const animate = () => {
            if (group.parent) {
                const scale = 1 + Math.sin(Date.now() * 0.02) * 0.3;
                spark.scale.set(scale, scale, scale);
                group.position.y = 0.5 + Math.sin(Date.now() * 0.005) * 0.05;
                group.rotation.y += 0.01;
                requestAnimationFrame(animate);
            }
        };
        animate();
    }

    createExplosion(x, z) {
        const particleCount = 50;
        const geometry = new THREE.SphereGeometry(0.2, 8, 8);

        for (let i = 0; i < particleCount; i++) {
            const isCore = Math.random() > 0.5;
            const color = isCore ? 0xFF4500 : 0xFFD700;

            const material = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 1
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, 0.5, z);

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const speed = 0.1 + Math.random() * 0.2;

            this.scene.add(mesh);

            this.particles.push({
                mesh,
                speedX: Math.sin(phi) * Math.cos(theta) * speed,
                speedY: Math.cos(phi) * speed,
                speedZ: Math.sin(phi) * Math.sin(theta) * speed,
                life: 1.0
            });
        }

        // 閃光
        const light = new THREE.PointLight(0xFFaa00, 5, 10);
        light.position.set(x, 2, z);
        this.scene.add(light);

        const fadeLight = () => {
            if (light.intensity > 0) {
                light.intensity -= 0.2;
                requestAnimationFrame(fadeLight);
            } else {
                this.scene.remove(light);
            }
        };
        fadeLight();
    }

    createNumber(x, z, num) {
        if (!this.font) return;

        const colors = [0x0000FF, 0x008000, 0xFF0000, 0x000080, 0x800000, 0x008080, 0x000000, 0x808080];
        const color = colors[num - 1] || 0x000000;

        const geometry = new TextGeometry(num.toString(), {
            font: this.font,
            size: 1,
            height: 0.2,
        });

        geometry.computeBoundingBox();
        const centerOffset = -0.5 * (geometry.boundingBox.max.x - geometry.boundingBox.min.x);
        geometry.translate(centerOffset, 0, 0);

        const material = new THREE.MeshStandardMaterial({ color });
        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.set(x, 0.1, z);
        mesh.rotation.x = -Math.PI / 2;

        this.scene.add(mesh);
    }

    showAllMines(mines) {
        mines.forEach((mine, index) => {
            setTimeout(() => {
                const tile = this.tiles[mine.x]?.[mine.z];
                if (tile && !tile.isRevealed) {
                    tile.mesh.visible = false;
                    this.createMine(tile.posX, tile.posZ);
                }
            }, index * 100);
        });
    }

    destroy() {
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.domElement.remove();
            this.renderer = null;
        }
    }
}

// ==========================================
// 觀戰客戶端類別
// ==========================================
class SpectateClient {
    constructor() {
        this.socket = null;
        this.roomCode = null;
        this.nickname = '';
        this.lastMessageTime = 0;
        this.messageCooldown = 2000; // 2 秒冷卻

        // 事件回調
        this.onConnected = null;
        this.onSpectateJoined = null;
        this.onGameStart = null;
        this.onTileRevealed = null;
        this.onTurnChanged = null;
        this.onTimerUpdate = null;
        this.onTimeoutAction = null;
        this.onGameOver = null;
        this.onSpectatorCountUpdate = null;
        this.onDanmaku = null;
        this.onError = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            // 動態載入 socket.io-client
            const script = document.createElement('script');
            script.src = '/socket.io/socket.io.js';
            script.onload = () => {
                this.socket = io();
                this.setupEventListeners();
                if (this.onConnected) this.onConnected();
                resolve();
            };
            script.onerror = () => reject(new Error('無法載入 Socket.IO'));
            document.head.appendChild(script);
        });
    }

    setupEventListeners() {
        // 觀戰加入成功
        this.socket.on('spectate_joined', (data) => {
            this.roomCode = data.roomCode;
            if (this.onSpectateJoined) this.onSpectateJoined(data);
        });

        // 觀戰錯誤
        this.socket.on('spectate_error', (data) => {
            if (this.onError) this.onError(data.error);
        });

        // 遊戲開始
        this.socket.on('game_start', (data) => {
            if (this.onGameStart) this.onGameStart(data);
        });

        // 格子揭開
        this.socket.on('tile_revealed', (data) => {
            if (this.onTileRevealed) this.onTileRevealed(data);
        });

        // 回合切換
        this.socket.on('turn_changed', (data) => {
            if (this.onTurnChanged) this.onTurnChanged(data);
        });

        // 計時器更新
        this.socket.on('timer_update', (data) => {
            if (this.onTimerUpdate) this.onTimerUpdate(data);
        });

        // 超時操作
        this.socket.on('timeout_action', (data) => {
            if (this.onTimeoutAction) this.onTimeoutAction(data);
        });

        // 遊戲結束
        this.socket.on('game_over', (data) => {
            if (this.onGameOver) this.onGameOver(data);
        });

        // 觀戰人數更新
        this.socket.on('spectator_count_update', (data) => {
            if (this.onSpectatorCountUpdate) this.onSpectatorCountUpdate(data);
        });

        // 彈幕訊息
        this.socket.on('danmaku', (data) => {
            if (this.onDanmaku) this.onDanmaku(data);
        });
    }

    joinSpectate(roomCode) {
        this.socket.emit('public_spectate', { roomCode: roomCode.toUpperCase() });
    }

    sendDanmaku(message) {
        const now = Date.now();
        if (now - this.lastMessageTime < this.messageCooldown) {
            return { success: false, error: '發送太快，請稍後再試' };
        }

        if (!message || message.trim().length === 0) {
            return { success: false, error: '訊息不能為空' };
        }

        if (message.length > 50) {
            return { success: false, error: '訊息不能超過 50 字' };
        }

        this.lastMessageTime = now;
        this.socket.emit('send_danmaku', {
            roomCode: this.roomCode,
            message: message.trim(),
            nickname: this.nickname || '匿名觀眾'
        });

        return { success: true };
    }

    setNickname(nickname) {
        this.nickname = nickname.trim().substring(0, 10);
    }
}

// ==========================================
// 觀戰控制器
// ==========================================
class WatchController {
    constructor() {
        this.renderer = new WatchRenderer();
        this.client = new SpectateClient();

        this.hostName = '';
        this.guestName = '';
        this.currentPlayer = null;
        this.gameActive = false;

        this.elements = {};
    }

    async init() {
        this.cacheElements();
        this.bindUIEvents();

        // 取得 URL 參數中的房間代碼
        const urlParams = new URLSearchParams(window.location.search);
        const roomCode = urlParams.get('room');

        if (!roomCode) {
            this.showError('請提供房間代碼');
            return;
        }

        this.updateLoadingStatus('正在連線到伺服器...');

        try {
            // 連接 Socket
            await this.client.connect();
            this.setupClientEventHandlers();

            this.updateLoadingStatus('正在初始化觀戰畫面...');

            // 初始化渲染器
            await this.renderer.init();

            this.updateLoadingStatus(`正在加入房間 ${roomCode}...`);

            // 加入觀戰
            this.client.joinSpectate(roomCode);

        } catch (error) {
            console.error('初始化失敗:', error);
            this.showError('連線失敗，請稍後再試');
        }
    }

    cacheElements() {
        this.elements = {
            loadingScreen: document.getElementById('loading-screen'),
            errorScreen: document.getElementById('error-screen'),
            spectateScreen: document.getElementById('spectate-screen'),
            loadingStatus: document.getElementById('loading-status'),
            errorMessage: document.getElementById('error-message'),
            roomCodeDisplay: document.getElementById('room-code-display'),
            spectatorCount: document.getElementById('spectator-count'),
            gameStatusText: document.getElementById('game-status-text'),
            hostName: document.getElementById('host-name'),
            guestName: document.getElementById('guest-name'),
            hostScore: document.getElementById('host-score'),
            guestScore: document.getElementById('guest-score'),
            hostCard: document.getElementById('host-card'),
            guestCard: document.getElementById('guest-card'),
            turnIndicator: document.getElementById('turn-indicator'),
            timerDisplay: document.getElementById('timer-display'),
            chatMessages: document.getElementById('chat-messages'),
            chatSidebar: document.getElementById('chat-sidebar'),
            toggleChatBtn: document.getElementById('toggle-chat-btn'),
            openChatBtn: document.getElementById('open-chat-btn'),
            nicknameInput: document.getElementById('nickname-input'),
            messageInput: document.getElementById('message-input'),
            sendMessageBtn: document.getElementById('send-message-btn'),
            gameOverOverlay: document.getElementById('game-over-overlay'),
            gameOverResult: document.getElementById('game-over-result'),
            gameOverMessage: document.getElementById('game-over-message')
        };
    }

    bindUIEvents() {
        // 切換聊天側邊欄
        this.elements.toggleChatBtn?.addEventListener('click', () => {
            this.toggleChat(false);
        });

        this.elements.openChatBtn?.addEventListener('click', () => {
            this.toggleChat(true);
        });

        // 發送彈幕
        this.elements.sendMessageBtn?.addEventListener('click', () => {
            this.sendMessage();
        });

        this.elements.messageInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // 暱稱變更
        this.elements.nicknameInput?.addEventListener('input', (e) => {
            this.client.setNickname(e.target.value);
        });
    }

    setupClientEventHandlers() {
        // 觀戰加入成功
        this.client.onSpectateJoined = (data) => {
            console.log('觀戰加入成功:', data);
            this.showSpectateScreen();

            this.elements.roomCodeDisplay.textContent = `房間: ${data.roomCode}`;
            this.elements.spectatorCount.textContent = `觀戰人數: ${data.spectatorCount}`;

            this.hostName = data.hostName || '房主';
            this.guestName = data.guestName || '挑戰者';

            this.elements.hostName.textContent = this.hostName;
            this.elements.guestName.textContent = this.guestName;

            // 如果遊戲已在進行中，載入當前狀態
            if (data.game) {
                this.loadGameState(data.game);
            }

            // 添加系統訊息
            this.addSystemMessage('已加入觀戰');
        };

        // 觀戰錯誤
        this.client.onError = (error) => {
            this.showError(error);
        };

        // 遊戲開始
        this.client.onGameStart = (data) => {
            console.log('遊戲開始:', data);
            this.gameActive = true;
            this.currentPlayer = data.currentPlayer;

            this.hostName = data.host?.name || '房主';
            this.guestName = data.guest?.name || '挑戰者';

            this.elements.hostName.textContent = this.hostName;
            this.elements.guestName.textContent = this.guestName;
            this.elements.hostScore.textContent = '0';
            this.elements.guestScore.textContent = '0';
            this.elements.gameStatusText.textContent = '遊戲進行中';

            this.renderer.createGrid(data.gridSize);
            this.updateTurnDisplay();
            this.updateTimer(data.timeRemaining);

            this.addSystemMessage('遊戲開始！');
        };

        // 格子揭開
        this.client.onTileRevealed = (data) => {
            if (data.revealedTiles) {
                this.renderer.revealMultipleTiles(data.revealedTiles);
            }

            if (data.scores) {
                this.elements.hostScore.textContent = data.scores.host;
                this.elements.guestScore.textContent = data.scores.guest;
            }

            this.updateTimer(data.timeRemaining);
        };

        // 回合切換
        this.client.onTurnChanged = (data) => {
            this.currentPlayer = data.currentPlayer;
            this.updateTurnDisplay();
            this.updateTimer(data.timeRemaining);

            if (data.scores) {
                this.elements.hostScore.textContent = data.scores.host;
                this.elements.guestScore.textContent = data.scores.guest;
            }
        };

        // 計時器更新
        this.client.onTimerUpdate = (data) => {
            this.updateTimer(data.timeRemaining);
        };

        // 超時操作
        this.client.onTimeoutAction = (data) => {
            if (data.revealedTiles) {
                this.renderer.revealMultipleTiles(data.revealedTiles);
            }
            if (!data.gameOver) {
                this.currentPlayer = data.nextPlayer;
                this.updateTurnDisplay();
                this.updateTimer(data.timeRemaining);
            }
        };

        // 遊戲結束
        this.client.onGameOver = (data) => {
            this.gameActive = false;
            this.elements.gameStatusText.textContent = '遊戲結束';

            // 顯示所有地雷
            if (data.allMines) {
                this.renderer.showAllMines(data.allMines);
            }

            // 顯示結果
            setTimeout(() => {
                const winnerName = data.winner === 'host' ? this.hostName : this.guestName;
                this.elements.gameOverResult.textContent = `🎉 ${winnerName} 獲勝！`;

                let reason = '';
                switch (data.reason) {
                    case 'hit_mine':
                        reason = '對手踩到地雷';
                        break;
                    case 'all_safe_revealed':
                        reason = '所有安全格已揭開';
                        break;
                    case 'opponent_disconnected':
                        reason = '對手已離線';
                        break;
                    case 'timeout_hit_mine':
                        reason = '超時後踩到地雷';
                        break;
                    default:
                        reason = '';
                }
                this.elements.gameOverMessage.textContent = reason;
                this.elements.gameOverOverlay.classList.remove('hidden');
            }, 1500);

            this.addSystemMessage(`遊戲結束！${data.winner === 'host' ? this.hostName : this.guestName} 獲勝！`);
        };

        // 觀戰人數更新
        this.client.onSpectatorCountUpdate = (data) => {
            this.elements.spectatorCount.textContent = `觀戰人數: ${data.count}`;
        };

        // 彈幕訊息
        this.client.onDanmaku = (data) => {
            this.addChatMessage(data.nickname, data.message, data.timestamp);
        };
    }

    loadGameState(gameState) {
        this.gameActive = true;
        this.currentPlayer = gameState.currentPlayer;

        this.renderer.createGrid(gameState.gridSize);

        // 顯示已揭開的格子
        if (gameState.grid) {
            for (let x = 0; x < gameState.gridSize; x++) {
                for (let z = 0; z < gameState.gridSize; z++) {
                    const tile = gameState.grid[x][z];
                    if (tile.isRevealed) {
                        this.renderer.revealTile(x, z, tile.isMine, tile.neighborMines);
                    }
                }
            }
        }

        if (gameState.scores) {
            this.elements.hostScore.textContent = gameState.scores.host;
            this.elements.guestScore.textContent = gameState.scores.guest;
        }

        this.updateTurnDisplay();
        this.updateTimer(gameState.timeRemaining);
        this.elements.gameStatusText.textContent = '遊戲進行中';
    }

    updateTurnDisplay() {
        const playerName = this.currentPlayer === 'host' ? this.hostName : this.guestName;
        this.elements.turnIndicator.textContent = `${playerName} 的回合`;

        // 高亮當前玩家卡片
        this.elements.hostCard.classList.toggle('active', this.currentPlayer === 'host');
        this.elements.guestCard.classList.toggle('active', this.currentPlayer === 'guest');
    }

    updateTimer(seconds) {
        this.elements.timerDisplay.textContent = seconds;
        this.elements.timerDisplay.classList.remove('timer-warning', 'timer-danger');

        if (seconds <= 5) {
            this.elements.timerDisplay.classList.add('timer-danger');
        } else if (seconds <= 10) {
            this.elements.timerDisplay.classList.add('timer-warning');
        }
    }

    toggleChat(show) {
        if (show) {
            this.elements.chatSidebar.classList.remove('collapsed');
            this.elements.openChatBtn.classList.add('hidden');
        } else {
            this.elements.chatSidebar.classList.add('collapsed');
            this.elements.openChatBtn.classList.remove('hidden');
        }
    }

    sendMessage() {
        const message = this.elements.messageInput.value;
        const result = this.client.sendDanmaku(message);

        if (result.success) {
            this.elements.messageInput.value = '';
        } else {
            // 顯示錯誤提示 (簡單處理)
            console.warn(result.error);
        }
    }

    addChatMessage(nickname, content, timestamp) {
        const messageEl = document.createElement('div');
        messageEl.className = 'chat-message';

        const time = new Date(timestamp).toLocaleTimeString('zh-TW', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageEl.innerHTML = `
            <div class="nickname">${this.escapeHtml(nickname)}</div>
            <div class="content">${this.escapeHtml(content)}</div>
            <div class="time">${time}</div>
        `;

        this.elements.chatMessages.appendChild(messageEl);
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;

        // 限制訊息數量
        while (this.elements.chatMessages.children.length > 100) {
            this.elements.chatMessages.removeChild(this.elements.chatMessages.firstChild);
        }
    }

    addSystemMessage(content) {
        const messageEl = document.createElement('div');
        messageEl.className = 'chat-message system';

        messageEl.innerHTML = `
            <div class="nickname">系統</div>
            <div class="content">${this.escapeHtml(content)}</div>
        `;

        this.elements.chatMessages.appendChild(messageEl);
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateLoadingStatus(status) {
        if (this.elements.loadingStatus) {
            this.elements.loadingStatus.textContent = status;
        }
    }

    showSpectateScreen() {
        this.elements.loadingScreen.classList.add('hidden');
        this.elements.errorScreen.classList.add('hidden');
        this.elements.spectateScreen.classList.remove('hidden');
    }

    showError(message) {
        this.elements.loadingScreen.classList.add('hidden');
        this.elements.spectateScreen.classList.add('hidden');
        this.elements.errorScreen.classList.remove('hidden');
        this.elements.errorMessage.textContent = message;
    }
}

// ==========================================
// 啟動觀戰
// ==========================================
const watchController = new WatchController();
watchController.init();

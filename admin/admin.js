/**
 * 後台管理前端邏輯
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
    MINE_INDICATOR: 0xff4444,  // 觀戰者看到的地雷標記
    TEXT: 0x333333
};

// 圖表配色
const CHART_COLORS = {
    playing: '#4CAF50',
    waiting: '#FFC107',
    finished: '#9E9E9E',
    playingBg: 'rgba(76, 175, 80, 0.8)',
    waitingBg: 'rgba(255, 193, 7, 0.8)',
    finishedBg: 'rgba(158, 158, 158, 0.8)',
    line: '#667eea',
    lineBg: 'rgba(102, 126, 234, 0.2)'
};

// ==========================================
// 圖表管理類別
// ==========================================
class ChartManager {
    constructor() {
        this.roomStatusChart = null;
        this.activityChart = null;
        this.activityHistory = [];
        this.maxHistoryPoints = 20;

        this.initCharts();
    }

    initCharts() {
        // 設定 Chart.js 全域樣式
        Chart.defaults.color = '#888';
        Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';

        this.initRoomStatusChart();
        this.initActivityChart();
    }

    initRoomStatusChart() {
        const ctx = document.getElementById('roomStatusChart');
        if (!ctx) return;

        this.roomStatusChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['對戰中', '等待中', '已結束'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: [
                        CHART_COLORS.playingBg,
                        CHART_COLORS.waitingBg,
                        CHART_COLORS.finishedBg
                    ],
                    borderColor: [
                        CHART_COLORS.playing,
                        CHART_COLORS.waiting,
                        CHART_COLORS.finished
                    ],
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            font: { size: 12 }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleFont: { size: 14 },
                        bodyFont: { size: 13 },
                        padding: 12,
                        callbacks: {
                            label: (context) => {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const value = context.raw;
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${context.label}: ${value} 間 (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    initActivityChart() {
        const ctx = document.getElementById('activityChart');
        if (!ctx) return;

        this.activityChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: '總房間數',
                        data: [],
                        borderColor: CHART_COLORS.line,
                        backgroundColor: CHART_COLORS.lineBg,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 6
                    },
                    {
                        label: '對戰中',
                        data: [],
                        borderColor: CHART_COLORS.playing,
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 2,
                        pointHoverRadius: 5,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        align: 'end',
                        labels: {
                            boxWidth: 12,
                            padding: 15,
                            usePointStyle: true,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleFont: { size: 13 },
                        bodyFont: { size: 12 },
                        padding: 10
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            maxRotation: 0,
                            font: { size: 10 }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            stepSize: 1,
                            font: { size: 11 }
                        }
                    }
                }
            }
        });
    }

    updateCharts(stats) {
        this.updateRoomStatusChart(stats);
        this.updateActivityChart(stats);
    }

    updateRoomStatusChart(stats) {
        if (!this.roomStatusChart) return;

        this.roomStatusChart.data.datasets[0].data = [
            stats.playingCount,
            stats.waitingCount,
            stats.finishedCount
        ];
        this.roomStatusChart.update('none');
    }

    updateActivityChart(stats) {
        if (!this.activityChart) return;

        const now = new Date();
        const timeLabel = now.toLocaleTimeString('zh-TW', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // 添加新數據點
        this.activityHistory.push({
            time: timeLabel,
            total: stats.totalRooms,
            playing: stats.playingCount
        });

        // 限制歷史數據點數量
        if (this.activityHistory.length > this.maxHistoryPoints) {
            this.activityHistory.shift();
        }

        // 更新圖表數據
        this.activityChart.data.labels = this.activityHistory.map(h => h.time);
        this.activityChart.data.datasets[0].data = this.activityHistory.map(h => h.total);
        this.activityChart.data.datasets[1].data = this.activityHistory.map(h => h.playing);
        this.activityChart.update('none');
    }

    destroy() {
        if (this.roomStatusChart) {
            this.roomStatusChart.destroy();
            this.roomStatusChart = null;
        }
        if (this.activityChart) {
            this.activityChart.destroy();
            this.activityChart = null;
        }
        this.activityHistory = [];
    }
}

// ==========================================
// 管理員客戶端類別
// ==========================================
class AdminClient {
    constructor() {
        this.socket = null;
        this.token = null;
        this.isAuthenticated = false;
        this.currentSpectateRoom = null;
        this.spectateRenderer = null;
        this.chartManager = null;

        this.init();
    }

    init() {
        this.bindEvents();
        this.checkStoredToken();
        this.chartManager = new ChartManager();
    }

    bindEvents() {
        // 登入表單
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // 登出按鈕
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.handleLogout();
        });

        // 返回儀表板按鈕
        document.getElementById('back-to-dashboard').addEventListener('click', () => {
            this.leaveSpectate();
        });
    }

    checkStoredToken() {
        const token = localStorage.getItem('adminToken');
        if (token) {
            this.token = token;
            this.connectSocket();
        }
    }

    async handleLogin() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('login-error');

        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                this.token = data.token;
                localStorage.setItem('adminToken', this.token);
                errorEl.textContent = '';
                this.connectSocket();
            } else {
                errorEl.textContent = data.error || '登入失敗';
            }
        } catch (error) {
            errorEl.textContent = '連線錯誤，請稍後再試';
            console.error('Login error:', error);
        }
    }

    handleLogout() {
        this.token = null;
        this.isAuthenticated = false;
        localStorage.removeItem('adminToken');

        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        this.showScreen('login');
    }

    connectSocket() {
        // 連接到 /admin 命名空間
        this.socket = io('/admin', {
            auth: { token: this.token }
        });

        this.socket.on('connect', () => {
            console.log('已連接到後台管理伺服器');
            this.isAuthenticated = true;
            this.showScreen('dashboard');
            this.subscribeToRooms();
        });

        this.socket.on('connect_error', (error) => {
            console.error('連線錯誤:', error.message);
            if (error.message === '驗證失敗') {
                this.handleLogout();
                document.getElementById('login-error').textContent = 'Token 已過期，請重新登入';
            }
        });

        this.socket.on('admin_error', (data) => {
            console.error('後台錯誤:', data.error);
        });

        // 房間列表更新
        this.socket.on('admin_rooms_update', (stats) => {
            this.updateDashboard(stats);
        });

        // 觀戰相關事件
        this.socket.on('spectate_joined', (data) => {
            this.onSpectateJoined(data);
        });

        this.socket.on('spectate_error', (data) => {
            alert('無法觀戰: ' + data.error);
        });

        this.socket.on('game_start', (data) => {
            if (this.spectateRenderer) {
                this.spectateRenderer.onGameStart(data);
            }
        });

        this.socket.on('tile_revealed', (data) => {
            if (this.spectateRenderer) {
                this.spectateRenderer.onTileRevealed(data);
            }
        });

        this.socket.on('turn_changed', (data) => {
            if (this.spectateRenderer) {
                this.spectateRenderer.onTurnChanged(data);
            }
        });

        this.socket.on('timer_update', (data) => {
            this.updateTimer(data.timeRemaining);
        });

        this.socket.on('timeout_action', (data) => {
            if (this.spectateRenderer) {
                this.spectateRenderer.onTimeoutAction(data);
            }
        });

        this.socket.on('game_over', (data) => {
            if (this.spectateRenderer) {
                this.spectateRenderer.onGameOver(data);
            }
        });

        this.socket.on('spectator_count_update', (data) => {
            document.getElementById('spectate-count').textContent = `👁️ 觀戰人數: ${data.count}`;
        });
    }

    subscribeToRooms() {
        if (this.socket && this.isAuthenticated) {
            this.socket.emit('admin_subscribe_rooms');
        }
    }

    updateDashboard(stats) {
        document.getElementById('total-rooms').textContent = stats.totalRooms;
        document.getElementById('playing-rooms').textContent = stats.playingCount;
        document.getElementById('waiting-rooms').textContent = stats.waitingCount;
        document.getElementById('finished-rooms').textContent = stats.finishedCount;

        // 更新圖表
        if (this.chartManager) {
            this.chartManager.updateCharts(stats);
        }

        this.updateRoomsTable(stats.rooms);
    }

    updateRoomsTable(rooms) {
        const tbody = document.getElementById('rooms-tbody');

        if (rooms.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="no-data">目前沒有房間</td></tr>';
            return;
        }

        tbody.innerHTML = rooms.map(room => {
            const statusClass = `status-${room.gameState}`;
            const statusText = {
                'waiting': '等待中',
                'playing': '對戰中',
                'finished': '已結束'
            }[room.gameState] || room.gameState;

            const currentPlayerText = room.currentPlayer
                ? (room.currentPlayer === 'host' ? room.hostName : room.guestName)
                : '-';

            const playDuration = room.playDuration !== null
                ? this.formatDuration(room.playDuration)
                : '-';

            const timeRemaining = room.timeRemaining !== null
                ? `${room.timeRemaining}s`
                : '-';

            const canSpectate = room.gameState === 'playing';

            return `
                <tr>
                    <td><code>${room.code}</code></td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${room.hostName || '-'}</td>
                    <td>${room.guestName || '-'}</td>
                    <td>${currentPlayerText}</td>
                    <td>${timeRemaining}</td>
                    <td>${playDuration}</td>
                    <td>${room.spectatorCount}</td>
                    <td>
                        <button class="btn btn-copy-link" onclick="adminClient.copyRoomLink('${room.code}', this)" title="複製房間連結">🔗</button>
                        ${canSpectate
                            ? `<button class="btn btn-spectate" onclick="adminClient.startSpectate('${room.code}')">👁️ 後台觀戰</button>
                               <button class="btn btn-spectate-public" onclick="window.open('/watch?room=${room.code}', '_blank')">🎮 前台觀戰</button>`
                            : ''
                        }
                    </td>
                </tr>
            `;
        }).join('');
    }

    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    startSpectate(roomCode) {
        this.currentSpectateRoom = roomCode;
        this.socket.emit('admin_spectate', { roomCode });
    }

    copyRoomLink(roomCode, btn) {
        const roomUrl = `${window.location.origin}/?room=${roomCode}`;
        navigator.clipboard.writeText(roomUrl).then(() => {
            // 簡單提示
            const originalText = btn.textContent;
            btn.textContent = '✓';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 1500);
        }).catch(() => {
            // 備用方案
            prompt('請手動複製房間連結:', roomUrl);
        });
    }

    onSpectateJoined(data) {
        console.log('開始觀戰:', data);

        document.getElementById('spectate-room-code').textContent = `房間: ${data.roomCode}`;
        document.getElementById('spectate-count').textContent = `👁️ 觀戰人數: ${data.spectatorCount}`;
        document.getElementById('spectate-host-name').textContent = data.hostName || '-';
        document.getElementById('spectate-guest-name').textContent = data.guestName || '-';

        this.showScreen('spectate');

        // 初始化觀戰渲染器
        if (!this.spectateRenderer) {
            this.spectateRenderer = new SpectateRenderer();
        }

        // 如果遊戲已在進行中，載入當前狀態
        if (data.game) {
            this.spectateRenderer.loadGameState(data.game, data.hostName, data.guestName);
        }
    }

    leaveSpectate() {
        if (this.socket) {
            this.socket.emit('admin_leave_spectate');
        }

        if (this.spectateRenderer) {
            this.spectateRenderer.destroy();
            this.spectateRenderer = null;
        }

        this.currentSpectateRoom = null;
        this.showScreen('dashboard');
        this.subscribeToRooms();
    }

    updateTimer(timeRemaining) {
        const timerEl = document.getElementById('spectate-timer');
        timerEl.textContent = timeRemaining;

        timerEl.classList.remove('warning', 'danger');
        if (timeRemaining <= 5) {
            timerEl.classList.add('danger');
        } else if (timeRemaining <= 10) {
            timerEl.classList.add('warning');
        }
    }

    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });
        document.getElementById(`${screenName}-screen`).classList.remove('hidden');
    }
}

// ==========================================
// 觀戰渲染器類別
// ==========================================
class SpectateRenderer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.font = null;
        this.tiles = [];
        this.gridSize = 10;
        this.mineIndicators = []; // 地雷標記
        this.hostName = '';
        this.guestName = '';

        this.materials = {
            grass: new THREE.MeshStandardMaterial({ color: COLORS.GRASS, roughness: 0.8 }),
            dirt: new THREE.MeshStandardMaterial({ color: COLORS.DIRT, roughness: 0.9 }),
        };

        this.init();
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

        // 地雷標記動畫
        this.mineIndicators.forEach(indicator => {
            indicator.rotation.y += 0.02;
            indicator.position.y = 0.8 + Math.sin(Date.now() * 0.003) * 0.1;
        });

        this.renderer.render(this.scene, this.camera);
    }

    loadGameState(gameState, hostName, guestName) {
        this.hostName = hostName;
        this.guestName = guestName;
        this.gridSize = gameState.gridSize;

        // 建立網格
        this.createGrid(gameState.gridSize);

        // 顯示已揭開的格子
        if (gameState.grid) {
            for (let x = 0; x < gameState.gridSize; x++) {
                for (let z = 0; z < gameState.gridSize; z++) {
                    const tile = gameState.grid[x][z];
                    if (tile.isRevealed) {
                        this.revealTile(x, z, tile.isMine, tile.neighborMines);
                    } else if (tile.isMine) {
                        // 顯示地雷標記（觀戰者可見）
                        this.showMineIndicator(x, z);
                    }
                }
            }
        }

        // 更新 UI
        this.updateGameUI(gameState, hostName, guestName);
    }

    createGrid(gridSize) {
        this.gridSize = gridSize;
        this.tiles = [];
        this.mineIndicators = [];

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

    showMineIndicator(x, z) {
        if (!this.tiles[x] || !this.tiles[x][z]) return;
        if (this.tiles[x][z].isRevealed) return;

        const tile = this.tiles[x][z];

        // 建立發光的地雷標記
        const group = new THREE.Group();

        // 外圈光暈
        const glowGeo = new THREE.RingGeometry(0.3, 0.5, 16);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xff4444,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = -Math.PI / 2;
        group.add(glow);

        // 中心點
        const dotGeo = new THREE.SphereGeometry(0.15, 16, 16);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        group.add(dot);

        group.position.set(tile.posX, 0.8, tile.posZ);
        this.scene.add(group);
        this.mineIndicators.push(group);

        tile.mineIndicator = group;
    }

    revealTile(x, z, isMine, neighborMines) {
        if (!this.tiles[x] || !this.tiles[x][z]) return;

        const tile = this.tiles[x][z];
        if (tile.isRevealed) return;

        tile.isRevealed = true;
        tile.mesh.visible = false;

        // 移除地雷標記
        if (tile.mineIndicator) {
            this.scene.remove(tile.mineIndicator);
            const idx = this.mineIndicators.indexOf(tile.mineIndicator);
            if (idx > -1) this.mineIndicators.splice(idx, 1);
            tile.mineIndicator = null;
        }

        if (isMine) {
            this.createMine(tile.posX, tile.posZ);
        } else if (neighborMines > 0) {
            this.createNumber(tile.posX, tile.posZ, neighborMines);
        }
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
        const capMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = 0.4;
        group.add(cap);

        // 引信
        const fuseGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.25, 8);
        const fuseMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const fuse = new THREE.Mesh(fuseGeo, fuseMat);
        fuse.position.y = 0.55;
        group.add(fuse);

        // 釘子
        const spikeGeo = new THREE.CylinderGeometry(0.02, 0.06, 0.2, 8);
        const spikeMat = new THREE.MeshStandardMaterial({ color: 0x333333 });

        const directions = [
            [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
            [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0.7, 0.7], [0, 0.7, -0.7]
        ];

        directions.forEach(dir => {
            const spike = new THREE.Mesh(spikeGeo, spikeMat);
            spike.position.set(dir[0] * 0.45, dir[1] * 0.45, dir[2] * 0.45);
            spike.lookAt(dir[0] * 2, dir[1] * 2, dir[2] * 2);
            spike.rotateX(Math.PI / 2);
            group.add(spike);
        });

        group.position.set(x, 0.5, z);
        this.scene.add(group);
    }

    createNumber(x, z, number) {
        if (!this.font) return;

        const colors = [
            0x0000FF, 0x008000, 0xFF0000, 0x000080,
            0x800000, 0x008080, 0x000000, 0x808080
        ];

        const textGeo = new TextGeometry(number.toString(), {
            font: this.font,
            size: 0.8,
            height: 0.1
        });
        textGeo.center();

        const textMat = new THREE.MeshStandardMaterial({
            color: colors[number - 1] || 0x000000
        });
        const textMesh = new THREE.Mesh(textGeo, textMat);
        textMesh.position.set(x, 0.15, z);
        textMesh.rotation.x = -Math.PI / 2;
        textMesh.castShadow = true;
        this.scene.add(textMesh);
    }

    updateGameUI(gameState, hostName, guestName) {
        document.getElementById('spectate-host-name').textContent = hostName || '-';
        document.getElementById('spectate-guest-name').textContent = guestName || '-';
        document.getElementById('spectate-host-score').textContent = `${gameState.scores?.host || 0} 分`;
        document.getElementById('spectate-guest-score').textContent = `${gameState.scores?.guest || 0} 分`;

        this.updateTurnIndicator(gameState.currentPlayer, hostName, guestName);
        document.getElementById('spectate-timer').textContent = gameState.timeRemaining || '--';

        // 高亮當前玩家
        const hostInfo = document.querySelector('.host-info');
        const guestInfo = document.querySelector('.guest-info');
        hostInfo.classList.toggle('active', gameState.currentPlayer === 'host');
        guestInfo.classList.toggle('active', gameState.currentPlayer === 'guest');
    }

    updateTurnIndicator(currentPlayer, hostName, guestName) {
        const turnEl = document.getElementById('spectate-turn');
        const name = currentPlayer === 'host' ? (hostName || '房主') : (guestName || '訪客');
        turnEl.textContent = `${name} 的回合`;
        turnEl.className = 'turn-indicator ' + (currentPlayer === 'host' ? 'host-turn' : 'guest-turn');
    }

    onGameStart(data) {
        this.createGrid(data.gridSize);

        // 顯示地雷標記
        if (data.grid) {
            for (let x = 0; x < data.gridSize; x++) {
                for (let z = 0; z < data.gridSize; z++) {
                    const tile = data.grid[x][z];
                    if (tile.isMine && !tile.isRevealed) {
                        this.showMineIndicator(x, z);
                    }
                }
            }
        }

        this.updateGameUI({
            currentPlayer: data.currentPlayer,
            timeRemaining: data.timeRemaining,
            scores: { host: 0, guest: 0 }
        }, data.host?.name, data.guest?.name);
    }

    onTileRevealed(data) {
        if (data.revealedTiles) {
            data.revealedTiles.forEach(tile => {
                this.revealTile(tile.x, tile.z, tile.isMine, tile.neighborMines);
            });
        }

        document.getElementById('spectate-host-score').textContent = `${data.scores?.host || 0} 分`;
        document.getElementById('spectate-guest-score').textContent = `${data.scores?.guest || 0} 分`;
    }

    onTurnChanged(data) {
        this.updateTurnIndicator(data.currentPlayer, this.hostName, this.guestName);
        document.getElementById('spectate-timer').textContent = data.timeRemaining || '--';

        const hostInfo = document.querySelector('.host-info');
        const guestInfo = document.querySelector('.guest-info');
        hostInfo.classList.toggle('active', data.currentPlayer === 'host');
        guestInfo.classList.toggle('active', data.currentPlayer === 'guest');

        if (data.scores) {
            document.getElementById('spectate-host-score').textContent = `${data.scores.host || 0} 分`;
            document.getElementById('spectate-guest-score').textContent = `${data.scores.guest || 0} 分`;
        }
    }

    onTimeoutAction(data) {
        if (data.revealedTiles) {
            data.revealedTiles.forEach(tile => {
                this.revealTile(tile.x, tile.z, tile.isMine, tile.neighborMines);
            });
        }
        this.onTurnChanged(data);
    }

    onGameOver(data) {
        const turnEl = document.getElementById('spectate-turn');
        const winnerName = data.winner === 'host' ? this.hostName : this.guestName;
        turnEl.textContent = `🏆 ${winnerName} 獲勝！`;
        turnEl.className = 'turn-indicator';

        document.getElementById('spectate-timer').textContent = '--';

        // 顯示所有地雷
        if (data.allMines) {
            data.allMines.forEach(mine => {
                this.revealTile(mine.x, mine.z, true, 0);
            });
        }

        // 移除所有地雷標記
        this.mineIndicators.forEach(indicator => {
            this.scene.remove(indicator);
        });
        this.mineIndicators = [];

        if (data.scores) {
            document.getElementById('spectate-host-score').textContent = `${data.scores.host || 0} 分`;
            document.getElementById('spectate-guest-score').textContent = `${data.scores.guest || 0} 分`;
        }
    }

    destroy() {
        if (this.renderer) {
            const container = document.getElementById('game-canvas-container');
            if (container && this.renderer.domElement) {
                container.removeChild(this.renderer.domElement);
            }
            this.renderer.dispose();
            this.renderer = null;
        }

        if (this.scene) {
            while (this.scene.children.length > 0) {
                this.scene.remove(this.scene.children[0]);
            }
            this.scene = null;
        }

        this.tiles = [];
        this.mineIndicators = [];
    }
}

// ==========================================
// 初始化
// ==========================================
const adminClient = new AdminClient();

// 暴露給全域（用於 HTML 內的 onclick）
window.adminClient = adminClient;

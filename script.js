/**
 * 雙人對戰 3D 踩地雷遊戲
 * 前端主程式
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';

// ==========================================
// 遊戲設定
// ==========================================
const TILE_SIZE = 2;
const TILE_SPACING = 0.2;

// 顏色與材質
const COLORS = {
    GRASS: 0x4CAF50,
    GRASS_HOVER: 0x66BB6A,
    GRASS_DISABLED: 0x9E9E9E,
    DIRT: 0xD7CCC8,
    TEXT: 0x333333,
    POKEBALL_RED: 0xFF0000,
    POKEBALL_WHITE: 0xFFFFFF,
    MINE_BLACK: 0x222222,
    EXPLOSION_CORE: 0xFF4500,
    EXPLOSION_OUTER: 0xFFD700
};

// ==========================================
// GameRenderer 類別 - 負責 3D 渲染
// ==========================================
class GameRenderer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = null;
        this.mouse = new THREE.Vector2();
        this.font = null;
        this.tiles = [];
        this.particles = [];
        this.gridSize = 10;

        this.materials = {
            grass: new THREE.MeshStandardMaterial({ color: COLORS.GRASS, roughness: 0.8 }),
            grassHover: new THREE.MeshStandardMaterial({ color: COLORS.GRASS_HOVER, roughness: 0.8 }),
            grassDisabled: new THREE.MeshStandardMaterial({ color: COLORS.GRASS_DISABLED, roughness: 0.8 }),
            dirt: new THREE.MeshStandardMaterial({ color: COLORS.DIRT, roughness: 0.9 }),
        };

        this.onTileClick = null; // 點擊回調
        this.onTileRightClick = null; // 右鍵回調
        this.isMyTurn = false;

        // 旗子相關
        this.flagCount = 0;
        this.maxFlags = 10;
    }

    async init() {
        // 場景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 20, 60);

        // 相機
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 25, 20);
        this.camera.lookAt(0, 0, 0);

        // 渲染器
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // 燈光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // 控制器
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.1;

        // 互動
        this.raycaster = new THREE.Raycaster();

        // 載入字型
        await this.loadFont();

        // 事件監聯
        window.addEventListener('resize', () => this.onWindowResize());
        window.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        window.addEventListener('pointermove', (e) => this.onPointerMove(e));
        window.addEventListener('contextmenu', (e) => this.onRightClick(e));

        // 開始動畫循環
        this.animate();
    }

    loadFont() {
        return new Promise((resolve) => {
            const loader = new FontLoader();
            loader.load('https://unpkg.com/three@0.154.0/examples/fonts/helvetiker_bold.typeface.json', (loadedFont) => {
                this.font = loadedFont;
                resolve();
            });
        });
    }

    createGrid(gridSize) {
        this.gridSize = gridSize;
        this.tiles = [];

        // 清除舊的場景物件
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
                // 建立草叢 (未揭開狀態)
                const geometry = new THREE.BoxGeometry(TILE_SIZE, 0.5, TILE_SIZE);
                const mesh = new THREE.Mesh(geometry, this.materials.grass.clone());

                const posX = x * (TILE_SIZE + TILE_SPACING) - offset;
                const posZ = z * (TILE_SIZE + TILE_SPACING) - offset;

                mesh.position.set(posX, 0.25, posZ);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.userData = { x, z, type: 'tile', isRevealed: false };

                this.scene.add(mesh);

                // 預先建立底座
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
                    isRevealed: false,
                    isFlagged: false,
                    flagMesh: null
                };
            }
        }

        // 建立地面
        const groundSize = gridSize * (TILE_SIZE + TILE_SPACING) + 2;
        const groundGeo = new THREE.BoxGeometry(groundSize, 0.1, groundSize);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x8BC34A });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.y = -0.1;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    /**
     * 建立旗子 3D 模型
     * @param {number} posX - 世界座標 X
     * @param {number} posZ - 世界座標 Z
     * @returns {THREE.Group} 旗子模型群組
     */
    createFlagMesh(posX, posZ) {
        const group = new THREE.Group();

        // 旗桿
        const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 0.6;
        pole.castShadow = true;
        group.add(pole);

        // 旗幟（三角形）
        const flagShape = new THREE.Shape();
        flagShape.moveTo(0, 0);
        flagShape.lineTo(0.6, 0.2);
        flagShape.lineTo(0, 0.4);
        flagShape.lineTo(0, 0);

        const flagGeo = new THREE.ShapeGeometry(flagShape);
        const flagMat = new THREE.MeshStandardMaterial({
            color: 0xFF0000,
            side: THREE.DoubleSide
        });
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.position.set(0.05, 0.9, 0);
        flag.castShadow = true;
        group.add(flag);

        group.position.set(posX, 0.5, posZ);
        return group;
    }

    /**
     * 切換旗子狀態
     * @param {number} x - 格子座標 X
     * @param {number} z - 格子座標 Z
     * @returns {number} 目前旗子數量
     */
    toggleFlag(x, z) {
        if (!this.tiles[x] || !this.tiles[x][z]) return this.flagCount;

        const tile = this.tiles[x][z];
        if (tile.isRevealed) return this.flagCount;

        if (tile.isFlagged) {
            // 移除旗子
            if (tile.flagMesh) {
                this.scene.remove(tile.flagMesh);
                tile.flagMesh = null;
            }
            tile.isFlagged = false;
            this.flagCount--;
        } else {
            // 檢查是否達到上限
            if (this.flagCount >= this.maxFlags) {
                return this.flagCount;
            }
            // 新增旗子
            const flagMesh = this.createFlagMesh(tile.posX, tile.posZ);
            this.scene.add(flagMesh);
            tile.flagMesh = flagMesh;
            tile.isFlagged = true;
            this.flagCount++;
        }

        return this.flagCount;
    }

    /**
     * 設定最大旗子數量
     * @param {number} count - 最大數量（通常等於地雷數）
     */
    setMaxFlags(count) {
        this.maxFlags = count;
    }

    /**
     * 取得目前旗子數量
     * @returns {number}
     */
    getFlagCount() {
        return this.flagCount;
    }

    /**
     * 清除所有旗子
     */
    clearAllFlags() {
        for (let x = 0; x < this.gridSize; x++) {
            for (let z = 0; z < this.gridSize; z++) {
                const tile = this.tiles[x]?.[z];
                if (tile && tile.isFlagged && tile.flagMesh) {
                    this.scene.remove(tile.flagMesh);
                    tile.flagMesh = null;
                    tile.isFlagged = false;
                }
            }
        }
        this.flagCount = 0;
    }

    revealTile(x, z, isMine, neighborMines) {
        if (!this.tiles[x] || !this.tiles[x][z]) return;

        const tile = this.tiles[x][z];
        if (tile.isRevealed) return;

        // 如果有旗子，先移除
        if (tile.isFlagged && tile.flagMesh) {
            this.scene.remove(tile.flagMesh);
            tile.flagMesh = null;
            tile.isFlagged = false;
            this.flagCount--;
        }

        tile.isRevealed = true;
        tile.mesh.visible = false;
        tile.mesh.userData.isRevealed = true;

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
            const color = isCore ? COLORS.EXPLOSION_CORE : COLORS.EXPLOSION_OUTER;

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

    setMyTurn(isMyTurn) {
        this.isMyTurn = isMyTurn;

        // 更新所有未揭開格子的顏色
        for (let x = 0; x < this.gridSize; x++) {
            for (let z = 0; z < this.gridSize; z++) {
                const tile = this.tiles[x]?.[z];
                if (tile && !tile.isRevealed) {
                    tile.mesh.material = isMyTurn ? this.materials.grass.clone() : this.materials.grassDisabled.clone();
                }
            }
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onPointerMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    onPointerDown(event) {
        if (event.button !== 0) return; // 只處理左鍵
        if (!this.isMyTurn) return;
        if (!this.onTileClick) return;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children);

        for (const intersect of intersects) {
            const object = intersect.object;
            if (object.userData.type === 'tile' && !object.userData.isRevealed) {
                const x = object.userData.x;
                const z = object.userData.z;
                const tile = this.tiles[x]?.[z];

                // 若已插旗，先取消旗子再揭開
                if (tile && tile.isFlagged) {
                    this.toggleFlag(x, z);
                    // 觸發回調更新 UI
                    if (this.onTileRightClick) {
                        this.onTileRightClick(x, z, true); // true 表示是自動取消
                    }
                }

                this.onTileClick(x, z);
                break;
            }
        }
    }

    /**
     * 右鍵點擊處理 - 插旗/取消旗子
     * @param {PointerEvent} event
     */
    onRightClick(event) {
        event.preventDefault(); // 阻止瀏覽器右鍵選單

        if (!this.onTileRightClick) return;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children);

        for (const intersect of intersects) {
            const object = intersect.object;
            if (object.userData.type === 'tile' && !object.userData.isRevealed) {
                const x = object.userData.x;
                const z = object.userData.z;
                this.toggleFlag(x, z);
                this.onTileRightClick(x, z, false);
                break;
            }
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        this.controls.update();

        // 懸停效果
        if (this.isMyTurn) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.scene.children);

            // 還原所有方塊顏色
            for (let x = 0; x < this.gridSize; x++) {
                for (let z = 0; z < this.gridSize; z++) {
                    const tile = this.tiles[x]?.[z];
                    if (tile && !tile.isRevealed && tile.mesh.material.color.getHex() !== COLORS.GRASS) {
                        tile.mesh.material.color.setHex(COLORS.GRASS);
                    }
                }
            }

            // 設定懸停顏色
            for (const intersect of intersects) {
                const object = intersect.object;
                if (object.userData.type === 'tile' && !object.userData.isRevealed) {
                    object.material.color.setHex(COLORS.GRASS_HOVER);
                    break;
                }
            }
        }

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
}

// ==========================================
// MultiplayerClient 類別 - 負責 WebSocket 通訊
// ==========================================
class MultiplayerClient {
    constructor() {
        this.socket = null;
        this.roomCode = null;
        this.playerRole = null;
        this.playerName = null;
        this.opponentName = null;

        // 事件回調
        this.onRoomCreated = null;
        this.onRoomJoined = null;
        this.onPlayerJoined = null;
        this.onGameStart = null;
        this.onTileRevealed = null;
        this.onTurnChanged = null;
        this.onTimerUpdate = null;
        this.onTimeoutAction = null;
        this.onGameOver = null;
        this.onError = null;
        this.onRestartRequested = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            // 動態載入 socket.io-client
            const script = document.createElement('script');
            script.src = '/socket.io/socket.io.js';
            script.onload = () => {
                this.socket = io();
                this.setupEventListeners();
                resolve();
            };
            script.onerror = () => reject(new Error('無法載入 Socket.IO'));
            document.head.appendChild(script);
        });
    }

    setupEventListeners() {
        // 房間建立成功
        this.socket.on('room_created', (data) => {
            this.roomCode = data.roomCode;
            this.playerRole = data.player.role;
            this.playerName = data.player.name;
            if (this.onRoomCreated) this.onRoomCreated(data);
        });

        // 房間加入成功
        this.socket.on('room_joined', (data) => {
            this.roomCode = data.roomCode;
            this.playerRole = data.player.role;
            this.playerName = data.player.name;
            this.opponentName = data.opponent.name;
            if (this.onRoomJoined) this.onRoomJoined(data);
        });

        // 有玩家加入
        this.socket.on('player_joined', (data) => {
            this.opponentName = data.opponent.name;
            if (this.onPlayerJoined) this.onPlayerJoined(data);
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

        // 錯誤
        this.socket.on('error', (data) => {
            if (this.onError) this.onError(data);
        });

        this.socket.on('join_error', (data) => {
            if (this.onError) this.onError(data);
        });

        // 重新開始請求
        this.socket.on('restart_requested', (data) => {
            if (this.onRestartRequested) this.onRestartRequested(data);
        });
    }

    createRoom(playerName, settings = {}) {
        this.socket.emit('create_room', { playerName, settings });
    }

    joinRoom(roomCode, playerName) {
        this.socket.emit('join_room', { roomCode: roomCode.toUpperCase(), playerName });
    }

    revealTile(x, z) {
        this.socket.emit('reveal_tile', { x, z });
    }

    passTurn() {
        this.socket.emit('pass_turn');
    }

    requestRestart() {
        this.socket.emit('request_restart');
    }

    acceptRestart() {
        this.socket.emit('accept_restart');
    }

    isMyTurn(currentPlayer) {
        return currentPlayer === this.playerRole;
    }
}

// ==========================================
// GameUI 類別 - 負責 UI 更新
// ==========================================
class GameUI {
    constructor() {
        this.elements = {};
    }

    cacheElements() {
        this.elements = {
            // 螢幕
            menuScreen: document.getElementById('menu-screen'),
            lobbyScreen: document.getElementById('lobby-screen'),
            gameScreen: document.getElementById('game-screen'),
            gameOverScreen: document.getElementById('game-over'),

            // 選單
            playerNameInput: document.getElementById('player-name'),
            createRoomBtn: document.getElementById('create-room-btn'),
            roomCodeInput: document.getElementById('room-code-input'),
            joinRoomBtn: document.getElementById('join-room-btn'),
            difficultySlider: document.getElementById('difficulty-slider'),
            difficultyValue: document.getElementById('difficulty-value'),

            // 大廳
            roomCodeDisplay: document.getElementById('room-code-display'),
            waitingStatus: document.getElementById('waiting-status'),

            // 遊戲 UI
            currentPlayerDisplay: document.getElementById('current-player'),
            timerDisplay: document.getElementById('timer-display'),
            myScore: document.getElementById('my-score'),
            opponentScore: document.getElementById('opponent-score'),
            myName: document.getElementById('my-name'),
            opponentName: document.getElementById('opponent-name'),
            turnIndicator: document.getElementById('turn-indicator'),
            passTurnBtn: document.getElementById('pass-turn-btn'),
            mineCount: document.getElementById('mine-count'),
            flagCounter: document.getElementById('flag-counter'),

            // 遊戲結束
            gameResult: document.getElementById('game-result'),
            restartBtn: document.getElementById('restart-btn'),
            backToMenuBtn: document.getElementById('back-to-menu-btn')
        };
    }

    init() {
        this.cacheElements();

        // 難度滑桿
        if (this.elements.difficultySlider) {
            this.elements.difficultySlider.addEventListener('input', (e) => {
                this.elements.difficultyValue.textContent = e.target.value;
            });
        }

        // 從伺服器載入預設設定
        this.loadServerConfig();
    }

    async loadServerConfig() {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                const config = await response.json();
                // 更新難度滑桿的預設值
                if (this.elements.difficultySlider && config.defaultMinesCount) {
                    this.elements.difficultySlider.value = config.defaultMinesCount;
                    this.elements.difficultySlider.dataset.default = config.defaultMinesCount;
                    this.elements.difficultyValue.textContent = config.defaultMinesCount;
                }
            }
        } catch (error) {
            console.warn('無法載入伺服器設定，使用預設值:', error);
        }
    }

    showScreen(screenName) {
        const screens = ['menuScreen', 'lobbyScreen', 'gameScreen', 'gameOverScreen'];
        screens.forEach(screen => {
            if (this.elements[screen]) {
                this.elements[screen].style.display = screen === screenName ? 'flex' : 'none';
            }
        });
    }

    showLobby(roomCode, isHost) {
        this.showScreen('lobbyScreen');
        this.elements.roomCodeDisplay.textContent = roomCode;
        this.elements.waitingStatus.textContent = isHost ? '等待對手加入...' : '連接中...';
    }

    showGame() {
        this.showScreen('gameScreen');
        if (this.elements.gameOverScreen) {
            this.elements.gameOverScreen.style.display = 'none';
        }
    }

    updatePlayerInfo(myName, opponentName) {
        if (this.elements.myName) this.elements.myName.textContent = myName;
        if (this.elements.opponentName) this.elements.opponentName.textContent = opponentName;
    }

    updateTurn(isMyTurn, playerName) {
        if (this.elements.turnIndicator) {
            this.elements.turnIndicator.textContent = isMyTurn ? '你的回合' : `${playerName} 的回合`;
            this.elements.turnIndicator.className = isMyTurn ? 'turn-indicator my-turn' : 'turn-indicator opponent-turn';
        }
    }

    updateTimer(seconds) {
        if (this.elements.timerDisplay) {
            this.elements.timerDisplay.textContent = seconds;
            this.elements.timerDisplay.className = seconds <= 5 ? 'timer-critical' : '';
        }
    }

    updateScores(myScore, opponentScore) {
        if (this.elements.myScore) this.elements.myScore.textContent = myScore;
        if (this.elements.opponentScore) this.elements.opponentScore.textContent = opponentScore;
    }

    updatePassButton(canPass, isMyTurn) {
        if (this.elements.passTurnBtn) {
            this.elements.passTurnBtn.disabled = !canPass || !isMyTurn;
            this.elements.passTurnBtn.textContent = canPass ? '傳遞回合' : '至少揭開 1 格';
        }
    }

    updateMineCount(count) {
        if (this.elements.mineCount) {
            this.elements.mineCount.textContent = count;
        }
    }

    updateFlagCounter(current, max) {
        if (this.elements.flagCounter) {
            this.elements.flagCounter.textContent = `🚩 ${current} / ${max}`;
        }
    }

    showGameOver(isWinner, reason, scores) {
        if (this.elements.gameOverScreen) {
            this.elements.gameOverScreen.style.display = 'block';
        }

        if (this.elements.gameResult) {
            let resultText = '';
            let resultColor = '';

            if (reason === 'opponent_disconnected') {
                resultText = '對手已離線，你獲勝了！';
                resultColor = '#4CAF50';
            } else if (isWinner) {
                resultText = '🎉 恭喜獲勝！';
                resultColor = '#4CAF50';
            } else {
                resultText = '💥 BOOM! 你輸了！';
                resultColor = '#FF0000';
            }

            this.elements.gameResult.textContent = resultText;
            this.elements.gameResult.style.color = resultColor;
        }
    }

    showError(message) {
        alert(message);
    }

    getPlayerName() {
        return this.elements.playerNameInput?.value.trim() || '玩家';
    }

    getRoomCode() {
        return this.elements.roomCodeInput?.value.trim().toUpperCase() || '';
    }

    getMinesCount() {
        return parseInt(this.elements.difficultySlider?.value) || 10;
    }
}

// ==========================================
// Game 類別 - 遊戲主控制器
// ==========================================
class Game {
    constructor() {
        this.renderer = new GameRenderer();
        this.client = new MultiplayerClient();
        this.ui = new GameUI();

        this.currentPlayer = null;
        this.canPass = false;
        this.gameActive = false;
    }

    async init() {
        // 初始化 UI
        this.ui.init();

        // 初始化渲染器
        await this.renderer.init();

        // 連接伺服器
        try {
            await this.client.connect();
            console.log('已連接到伺服器');
        } catch (error) {
            console.error('連接失敗:', error);
            this.ui.showError('無法連接到伺服器');
            return;
        }

        // 設定事件處理
        this.setupEventHandlers();
        this.setupUIEventListeners();

        // 顯示選單
        this.ui.showScreen('menuScreen');
    }

    setupEventHandlers() {
        // 房間建立成功
        this.client.onRoomCreated = (data) => {
            console.log('房間已建立:', data.roomCode);
            this.ui.showLobby(data.roomCode, true);
        };

        // 房間加入成功
        this.client.onRoomJoined = (data) => {
            console.log('已加入房間:', data.roomCode);
            this.ui.showLobby(data.roomCode, false);
            this.ui.elements.waitingStatus.textContent = '等待遊戲開始...';
        };

        // 有玩家加入
        this.client.onPlayerJoined = (data) => {
            console.log('玩家加入:', data.opponent.name);
            this.ui.elements.waitingStatus.textContent = `${data.opponent.name} 已加入！遊戲即將開始...`;
        };

        // 遊戲開始
        this.client.onGameStart = (data) => {
            console.log('遊戲開始:', data);
            this.startGame(data);
        };

        // 格子揭開
        this.client.onTileRevealed = (data) => {
            this.handleTileRevealed(data);
        };

        // 回合切換
        this.client.onTurnChanged = (data) => {
            this.handleTurnChanged(data);
        };

        // 計時器更新
        this.client.onTimerUpdate = (data) => {
            this.ui.updateTimer(data.timeRemaining);
        };

        // 超時操作
        this.client.onTimeoutAction = (data) => {
            console.log('超時操作:', data);
            if (data.revealedTiles) {
                this.renderer.revealMultipleTiles(data.revealedTiles);
            }
            if (!data.gameOver) {
                this.handleTurnChanged({
                    currentPlayer: data.nextPlayer,
                    timeRemaining: data.timeRemaining
                });
            }
        };

        // 遊戲結束
        this.client.onGameOver = (data) => {
            this.handleGameOver(data);
        };

        // 錯誤處理
        this.client.onError = (data) => {
            console.error('錯誤:', data.error);
            this.ui.showError(data.error);
        };

        // 重新開始請求
        this.client.onRestartRequested = (data) => {
            if (confirm('對手請求重新開始，是否同意？')) {
                this.client.acceptRestart();
            }
        };

        // 渲染器點擊回調
        this.renderer.onTileClick = (x, z) => {
            if (this.gameActive && this.client.isMyTurn(this.currentPlayer)) {
                this.client.revealTile(x, z);
            }
        };

        // 渲染器右鍵回調 (插旗)
        this.renderer.onTileRightClick = (x, z, isAutoRemove) => {
            // 更新旗子計數 UI
            this.ui.updateFlagCounter(
                this.renderer.getFlagCount(),
                this.renderer.maxFlags
            );
        };
    }

    setupUIEventListeners() {
        // 建立房間
        this.ui.elements.createRoomBtn?.addEventListener('click', () => {
            const playerName = this.ui.getPlayerName();
            const minesCount = this.ui.getMinesCount();
            this.client.createRoom(playerName, { minesCount });
        });

        // 加入房間
        this.ui.elements.joinRoomBtn?.addEventListener('click', () => {
            const playerName = this.ui.getPlayerName();
            const roomCode = this.ui.getRoomCode();

            if (!roomCode) {
                this.ui.showError('請輸入房間代碼');
                return;
            }

            this.client.joinRoom(roomCode, playerName);
        });

        // 傳遞回合
        this.ui.elements.passTurnBtn?.addEventListener('click', () => {
            if (this.canPass && this.client.isMyTurn(this.currentPlayer)) {
                this.client.passTurn();
            }
        });

        // 重新開始
        this.ui.elements.restartBtn?.addEventListener('click', () => {
            this.client.requestRestart();
        });

        // 返回選單
        this.ui.elements.backToMenuBtn?.addEventListener('click', () => {
            location.reload();
        });
    }

    startGame(data) {
        this.gameActive = true;
        this.currentPlayer = data.currentPlayer;
        this.canPass = false;

        // 建立遊戲網格
        this.renderer.createGrid(data.gridSize);

        // 設定旗子上限為地雷數量
        this.renderer.setMaxFlags(data.minesCount);
        this.renderer.clearAllFlags();

        // 更新 UI
        this.ui.showGame();
        this.ui.updateFlagCounter(0, data.minesCount);
        this.ui.updatePlayerInfo(
            this.client.playerName,
            this.client.opponentName
        );
        this.ui.updateMineCount(data.minesCount);
        this.ui.updateScores(0, 0);
        this.ui.updateTimer(data.timeRemaining);

        // 設定回合
        const isMyTurn = this.client.isMyTurn(this.currentPlayer);
        this.renderer.setMyTurn(isMyTurn);
        this.ui.updateTurn(isMyTurn, this.getPlayerName(this.currentPlayer));
        this.ui.updatePassButton(false, isMyTurn);
    }

    handleTileRevealed(data) {
        // 更新渲染
        if (data.revealedTiles) {
            this.renderer.revealMultipleTiles(data.revealedTiles);
        }

        // 更新 UI
        this.canPass = data.canPass;
        const isMyTurn = this.client.isMyTurn(this.currentPlayer);
        this.ui.updatePassButton(data.canPass, isMyTurn);
        this.ui.updateTimer(data.timeRemaining);

        // 更新分數
        const myScore = this.client.playerRole === 'host' ? data.scores.host : data.scores.guest;
        const opponentScore = this.client.playerRole === 'host' ? data.scores.guest : data.scores.host;
        this.ui.updateScores(myScore, opponentScore);
    }

    handleTurnChanged(data) {
        this.currentPlayer = data.currentPlayer;
        this.canPass = false;

        const isMyTurn = this.client.isMyTurn(this.currentPlayer);
        this.renderer.setMyTurn(isMyTurn);
        this.ui.updateTurn(isMyTurn, this.getPlayerName(this.currentPlayer));
        this.ui.updatePassButton(false, isMyTurn);
        this.ui.updateTimer(data.timeRemaining);

        // 更新分數
        if (data.scores) {
            const myScore = this.client.playerRole === 'host' ? data.scores.host : data.scores.guest;
            const opponentScore = this.client.playerRole === 'host' ? data.scores.guest : data.scores.host;
            this.ui.updateScores(myScore, opponentScore);
        }
    }

    handleGameOver(data) {
        this.gameActive = false;

        // 顯示所有地雷
        if (data.allMines) {
            this.renderer.showAllMines(data.allMines);
        }

        // 判斷是否獲勝
        const isWinner = data.winner === this.client.playerRole;

        // 取得分數
        const myScore = this.client.playerRole === 'host' ? data.scores?.host : data.scores?.guest;
        const opponentScore = this.client.playerRole === 'host' ? data.scores?.guest : data.scores?.host;

        // 顯示結果
        setTimeout(() => {
            this.ui.showGameOver(isWinner, data.reason, { myScore, opponentScore });
        }, 1500);
    }

    getPlayerName(role) {
        if (role === this.client.playerRole) {
            return this.client.playerName;
        }
        return this.client.opponentName;
    }
}

// ==========================================
// 啟動遊戲
// ==========================================
const game = new Game();
game.init();

/**
 * 伺服器主入口
 * Express 靜態檔案服務 + Socket.IO 伺服器
 */
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CONFIG } from './config.js';
import { setupSocketHandlers } from './socketHandler.js';
import { setupAdminHandler } from './adminHandler.js';
import { verifyCredentials, generateToken } from './adminAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// JSON 解析中介軟體
app.use(express.json());

// 靜態檔案服務 (提供前端檔案)
app.use(express.static(join(__dirname, '..')));

// 後台管理靜態檔案服務
app.use('/admin', express.static(join(__dirname, '..', 'admin')));

// 公開觀戰頁面靜態檔案服務
app.use('/watch', express.static(join(__dirname, '..', 'watch')));

// 設定 /admin 命名空間
const adminNamespace = io.of('/admin');

// 設定後台管理 Socket 處理器
setupAdminHandler(adminNamespace, io);

// 設定 Socket.IO 事件處理（傳入 adminNamespace）
setupSocketHandlers(io, adminNamespace);

// 健康檢查端點
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// 設定 API 端點（提供前端需要的預設設定值）
app.get('/api/config', (req, res) => {
    res.json({
        defaultMinesCount: CONFIG.DEFAULT_MINES_COUNT,
        gridSize: CONFIG.GRID_SIZE,
        turnTimeLimit: CONFIG.TURN_TIME_LIMIT,
        minRevealsToPass: CONFIG.MIN_REVEALS_TO_PASS
    });
});

// 後台管理登入 API
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, error: '請提供帳號和密碼' });
    }

    if (verifyCredentials(username, password)) {
        const token = generateToken({ username, role: 'admin' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, error: '帳號或密碼錯誤' });
    }
});

// 啟動伺服器
httpServer.listen(CONFIG.PORT, () => {
    console.log('==========================================');
    console.log('   🎮 雙人踩地雷伺服器已啟動');
    console.log('==========================================');
    console.log(`   📡 伺服器地址: http://localhost:${CONFIG.PORT}`);
    console.log(`   🔧 後台管理: http://localhost:${CONFIG.PORT}/admin`);
    console.log(`   👁️  公開觀戰: http://localhost:${CONFIG.PORT}/watch?room=XXXXXX`);
    console.log(`   ⏱️  回合時間限制: ${CONFIG.TURN_TIME_LIMIT} 秒`);
    console.log(`   📐 網格大小: ${CONFIG.GRID_SIZE}x${CONFIG.GRID_SIZE}`);
    console.log(`   💣 預設地雷數: ${CONFIG.DEFAULT_MINES_COUNT}`);
    console.log('==========================================');
});

export { app, io };

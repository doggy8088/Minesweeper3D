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

// 靜態檔案服務 (提供前端檔案)
app.use(express.static(join(__dirname, '..')));

// 設定 Socket.IO 事件處理
setupSocketHandlers(io);

// 健康檢查端點
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// 啟動伺服器
httpServer.listen(CONFIG.PORT, () => {
    console.log('==========================================');
    console.log('   🎮 雙人踩地雷伺服器已啟動');
    console.log('==========================================');
    console.log(`   📡 伺服器地址: http://localhost:${CONFIG.PORT}`);
    console.log(`   ⏱️  回合時間限制: ${CONFIG.TURN_TIME_LIMIT} 秒`);
    console.log(`   📐 網格大小: ${CONFIG.GRID_SIZE}x${CONFIG.GRID_SIZE}`);
    console.log(`   💣 預設地雷數: ${CONFIG.DEFAULT_MINES_COUNT}`);
    console.log('==========================================');
});

export { app, io };

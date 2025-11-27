# Copilot Instructions - 雙人對戰 3D 踩地雷遊戲

## 專案概述

這是一個使用 Three.js 實現的雙人對戰 3D 踩地雷遊戲，採用 Socket.IO 進行即時多人連線。遊戲規則：玩家輪流揭開格子，揭開至少 1 格後可傳遞回合給對方，踩到地雷者輸。

## 架構

```
├── index.html + script.js    # 前端（Three.js 3D 渲染 + Socket.IO 客戶端）
├── admin/                    # 後台管理介面
│   ├── index.html            # 登入 + 儀表板 + 觀戰介面
│   ├── admin.js              # 前端邏輯（Socket 連線、3D 觀戰渲染）
│   └── admin.css             # 後台樣式
└── server/                   # 後端（Express + Socket.IO）
    ├── index.js              # 伺服器入口，設定 Express 靜態檔案與 Socket.IO
    ├── config.js             # 遊戲參數 + 管理員帳號設定
    ├── gameEngine.js         # 遊戲邏輯核心（網格生成、揭開、勝負判定、計時）
    ├── roomManager.js        # 房間管理（建立/加入/離開房間、玩家角色、觀戰者追蹤）
    ├── socketHandler.js      # WebSocket 事件處理（遊戲事件路由 + 觀戰廣播）
    ├── adminAuth.js          # JWT 認證模組
    └── adminHandler.js       # 後台 Socket 事件處理器（/admin 命名空間）
```

## 核心模式

### 玩家角色
- 使用 `'host'` 和 `'guest'` 字串識別玩家，非數字 ID
- 房主 (host) 先手，訪客 (guest) 後手

### Socket 命名空間
- **主命名空間 `/`**：遊戲玩家連線
- **`/admin` 命名空間**：後台管理員連線，需 JWT 驗證

### Socket 事件流（遊戲）
```
Client                    Server
  |-- create_room --------->|  建立房間
  |<---- room_created ------|
  |-- join_room ----------->|  加入房間
  |<---- room_joined -------|
  |<---- game_start --------|  雙方就緒自動開始
  |-- reveal_tile --------->|  揭開格子
  |<---- tile_revealed -----|  廣播結果（同時廣播給觀戰者）
  |-- pass_turn ----------->|  傳遞回合
  |<---- turn_changed ------|
```

### Socket 事件流（後台）
```
Admin Client              Server (/admin)
  |-- (HTTP) /api/admin/login -->|  取得 JWT Token
  |-- connect (with token) ---->|  帶 Token 連線
  |-- admin_subscribe_rooms --->|  訂閱房間列表
  |<---- admin_rooms_update ----|  推送房間統計
  |-- admin_spectate { roomCode } -->|  開始觀戰
  |<---- spectate_joined -------|  進入觀戰模式
  |<---- tile_revealed ---------|  接收遊戲事件（含地雷位置）
```

### 遊戲狀態管理
- `GameEngine` 實例存於 `room.game`
- 狀態：`waiting` → `playing` → `finished`
- 計時器邏輯在 `GameEngine` 內部，透過回調通知
- 房間額外追蹤：`gameStartedAt`（遊戲開始時間）、`spectators`（觀戰者 Set）

## 開發指令

```bash
npm install          # 安裝依賴
npm run dev          # 開發模式（啟用 --watch 自動重載）
npm start            # 生產模式
# 遊戲：http://localhost:3000
# 後台：http://localhost:3000/admin（帳密見 config.js）
```

## 程式碼慣例

### 前端 (script.js)
- 使用 ES6 類別：`GameRenderer`（3D 渲染）、`MultiplayerClient`（WebSocket）、`GameController`（整合控制）
- Three.js 透過 CDN importmap 載入
- 座標系使用 `x, z`（非 x, y），y 軸為高度

### 後端 (server/)
- ES Modules (`"type": "module"`)
- 函式參數使用 JSDoc 註解
- 房間代碼 6 位英數字，存於 `Map` 結構
- 錯誤回傳格式：`{ success: false, error: '訊息' }`

### 後台管理 (admin/)
- 使用與主遊戲相同的 Three.js CDN importmap
- `SpectateRenderer` 類別複用 3D 渲染邏輯，加入地雷標記顯示
- JWT Token 存於 `localStorage`，有效期 24 小時

### 設定參數
修改 `server/config.js`：
```javascript
// 管理員設定
ADMIN_USERNAME: 'admin',
ADMIN_PASSWORD: '...',
JWT_SECRET: '...',
// 遊戲設定
TURN_TIME_LIMIT: 30,      // 回合秒數
GRID_SIZE: 10,            // 網格大小
DEFAULT_MINES_COUNT: 18,  // 地雷數
MIN_REVEALS_TO_PASS: 1    // 傳遞前最少揭開數
```

## 重要邏輯

### 自動展開 (doReveal)
當揭開的格子 `neighborMines === 0` 時，遞迴展開周圍 8 格

### 勝負條件
- 踩到地雷 → 對手獲勝
- 所有安全格揭開 → 最後傳遞回合的玩家獲勝
- 對手斷線 → 自己獲勝
- 回合超時 → 自動揭開一個安全格並傳遞

### 觀戰者資料流
- 觀戰者透過 `getSpectatorGameState()` 取得完整遊戲狀態（含地雷位置）
- 遊戲事件同時廣播給 Socket.IO room `spectate:{roomCode}`
- 觀戰人數變化時透過 `spectator_count_update` 通知房間內所有人

## 注意事項
- 前端不存地雷位置，由伺服器控制（防作弊）
- `getClientGrid()` 過濾未揭開格的地雷資訊（給玩家）
- `getFullGridForSpectator()` 回傳完整地雷資訊（給觀戰者）
- 房間 30 分鐘閒置自動清理
- 後台事件需更新房間列表時，呼叫 `broadcastRoomsUpdate(adminNamespace)`

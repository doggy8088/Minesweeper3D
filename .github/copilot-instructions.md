# Copilot Instructions - 雙人對戰 3D 踩地雷遊戲

## 專案概述

這是一個使用 Three.js 實現的雙人對戰 3D 踩地雷遊戲，採用 Socket.IO 進行即時多人連線。遊戲規則：玩家輪流揭開格子，揭開至少 1 格後可傳遞回合給對方，踩到地雷者輸。

## 架構

```
├── index.html + script.js    # 前端（Three.js 3D 渲染 + Socket.IO 客戶端）
└── server/                   # 後端（Express + Socket.IO）
    ├── index.js              # 伺服器入口，設定 Express 靜態檔案與 Socket.IO
    ├── config.js             # 遊戲參數（網格大小、地雷數、回合時間等）
    ├── gameEngine.js         # 遊戲邏輯核心（網格生成、揭開、勝負判定、計時）
    ├── roomManager.js        # 房間管理（建立/加入/離開房間、玩家角色）
    └── socketHandler.js      # WebSocket 事件處理（遊戲事件路由）
```

## 核心模式

### 玩家角色
- 使用 `'host'` 和 `'guest'` 字串識別玩家，非數字 ID
- 房主 (host) 先手，訪客 (guest) 後手

### Socket 事件流
```
Client                    Server
  |-- create_room --------->|  建立房間
  |<---- room_created ------|
  |-- join_room ----------->|  加入房間
  |<---- room_joined -------|
  |<---- game_start --------|  雙方就緒自動開始
  |-- reveal_tile --------->|  揭開格子
  |<---- tile_revealed -----|  廣播結果
  |-- pass_turn ----------->|  傳遞回合
  |<---- turn_changed ------|
```

### 遊戲狀態管理
- `GameEngine` 實例存於 `room.game`
- 狀態：`waiting` → `playing` → `finished`
- 計時器邏輯在 `GameEngine` 內部，透過回調通知

## 開發指令

```bash
npm install          # 安裝依賴
npm run dev          # 開發模式（啟用 --watch 自動重載）
npm start            # 生產模式
# 開啟 http://localhost:3000
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

### 設定參數
修改 `server/config.js`：
```javascript
TURN_TIME_LIMIT: 30,      // 回合秒數
GRID_SIZE: 10,            // 網格大小
DEFAULT_MINES_COUNT: 10,  // 地雷數
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

## 注意事項
- 前端不存地雷位置，由伺服器控制（防作弊）
- `getClientGrid()` 過濾未揭開格的地雷資訊
- 房間 30 分鐘閒置自動清理

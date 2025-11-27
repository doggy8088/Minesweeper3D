## Plan: 雙人對戰踩地雷遊戲設計 (更新版)

整合您的回饋：加入 30 秒回合限制（參數化）、不實作觀戰模式、不需要資料庫/排名系統。以下是最終的開發計畫。

---

### Steps

1. **建立後端專案結構** - 在 [`server/`](g:\Projects\game1\server) 資料夾建立 Node.js 專案，安裝 `express`、`socket.io`、`uuid` 依賴，並建立 [`server/config.js`](g:\Projects\game1\server\config.js) 存放參數化設定（`TURN_TIME_LIMIT: 30`、`GRID_SIZE`、`MINES_COUNT` 等）

2. **實作房間管理系統** - 在 [`server/roomManager.js`](g:\Projects\game1\server\roomManager.js) 實作 `createRoom()`、`joinRoom()`、`leaveRoom()`、`getRoomByCode()` 函數，使用 6 位英數字房間代碼

3. **實作遊戲邏輯引擎** - 在 [`server/gameEngine.js`](g:\Projects\game1\server\gameEngine.js) 實作 `GameEngine` 類別：`generateGrid()`、`revealTile()`、`passTurn()`、`checkWinCondition()`、回合計時器管理

4. **建立 WebSocket 事件處理** - 在 [`server/socketHandler.js`](g:\Projects\game1\server\socketHandler.js) 處理所有 Socket.IO 事件，整合房間管理與遊戲引擎，實作回合超時自動揭格邏輯

5. **建立後端主入口** - 在 [`server/index.js`](g:\Projects\game1\server\index.js) 設定 Express 靜態檔案服務 + Socket.IO 伺服器

6. **重構前端遊戲邏輯** - 修改 [`script.js`](g:\Projects\game1\script.js)：抽離 `GameRenderer` 類別負責 3D 渲染、新增 `MultiplayerClient` 類別處理 WebSocket 通訊、新增回合計時器 UI

7. **更新前端介面** - 修改 [`index.html`](g:\Projects\game1\index.html)：新增房間建立/加入畫面、對手資訊面板、回合倒數計時顯示、「傳遞回合」按鈕

---

### 📁 最終專案結構

```
g:\Projects\game1\
├── index.html              # 更新：新增多人遊戲 UI
├── script.js               # 更新：重構 + WebSocket 客戶端
├── package.json            # 新增：專案設定
└── server/
    ├── index.js            # 新增：伺服器入口
    ├── config.js           # 新增：參數化設定
    ├── roomManager.js      # 新增：房間管理
    ├── gameEngine.js       # 新增：遊戲邏輯
    └── socketHandler.js    # 新增：WebSocket 處理
```

---

### ⚙️ 參數化設定 (`server/config.js`)

| 參數名稱 | 預設值 | 說明 |
|---------|--------|------|
| `TURN_TIME_LIMIT` | 30 | 回合時間限制（秒） |
| `GRID_SIZE` | 10 | 網格大小 |
| `DEFAULT_MINES_COUNT` | 10 | 預設地雷數量 |
| `MIN_REVEALS_TO_PASS` | 1 | 傳遞回合前最少揭開格數 |
| `ROOM_CODE_LENGTH` | 6 | 房間代碼長度 |

---

### 🔄 回合超時處理流程

```
玩家 A 回合開始
    ↓
伺服器啟動 30 秒計時器
    ↓
[情況 1] 玩家正常操作 → 計時器重置或取消
[情況 2] 30 秒超時 → 伺服器自動隨機揭開 1 格安全格
    ↓
    ├─ 若無安全格可揭 → 強制揭開地雷 → 玩家 A 輸
    └─ 若揭開成功 → 自動傳遞回合給玩家 B
```

---

### 🎮 詳細遊戲規則

#### 核心規則
1. **回合制傳遞機制**：
   - 當前玩家必須**至少揭開 1 格**才能將回合傳遞給對手
   - 玩家可以選擇繼續揭開（風險更高但壓力轉給對方）或立即傳遞
   - 揭開格子顯示「安全」或「數字」時繼續當前玩家回合

2. **勝負判定**：
   - 踩到地雷的玩家**立即落敗**
   - 如果所有安全格都被揭開，**最後傳遞回合的玩家獲勝**（對手無路可走）

3. **策略要素**：
   - 揭開「0」的格子會自動展開安全區域（可累計為「至少揭開 1 格」）
   - 玩家可以故意留下高風險區域給對手

#### 範例情境
```
情境 1：
- 玩家 A 開始，揭開 3 個安全格後感覺不確定 → 傳遞給 B
- 玩家 B 揭開 1 格安全 → 傳遞給 A
- 玩家 A 揭開 1 格是地雷 → A 輸！

情境 2：
- 玩家 A 揭開 5 格（包含一個「0」展開區域）→ 傳遞給 B
- 玩家 B 只剩危險區域，揭開 1 格是地雷 → B 輸！
```

---

### 📡 WebSocket 事件列表

| 事件名稱 | 方向 | 說明 |
|---------|------|------|
| `create_room` | Client → Server | 建立新房間 |
| `join_room` | Client → Server | 加入房間 |
| `room_joined` | Server → Client | 房間加入成功 |
| `game_start` | Server → Both | 遊戲開始，同步初始狀態 |
| `reveal_tile` | Client → Server | 揭開格子請求 |
| `tile_revealed` | Server → Both | 格子揭開結果同步 |
| `pass_turn` | Client → Server | 傳遞回合 |
| `turn_changed` | Server → Both | 回合切換通知 |
| `timer_update` | Server → Both | 倒數計時同步 |
| `game_over` | Server → Both | 遊戲結束，宣布勝負 |

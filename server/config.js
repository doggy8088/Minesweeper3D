/**
 * 遊戲參數化設定
 */
export const CONFIG = {
    // 管理員帳號設定
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'admin123',
    JWT_SECRET: 'minesweeper3d-admin-secret-key-2024',

    // 回合時間限制（秒）
    TURN_TIME_LIMIT: 30,

    // 網格大小
    GRID_SIZE: 10,

    // 預設地雷數量
    DEFAULT_MINES_COUNT: 18,

    // 傳遞回合前最少揭開格數
    MIN_REVEALS_TO_PASS: 1,

    // 房間代碼長度
    ROOM_CODE_LENGTH: 6,

    // 伺服器設定
    PORT: 3000,

    // 房間相關設定
    ROOM_IDLE_TIMEOUT: 30 * 60 * 1000, // 30 分鐘閒置超時
};

export default CONFIG;

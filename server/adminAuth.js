/**
 * 管理員認證模組
 */
import jwt from 'jsonwebtoken';
import { CONFIG } from './config.js';

/**
 * 驗證管理員帳密
 * @param {string} username - 使用者名稱
 * @param {string} password - 密碼
 * @returns {boolean} 是否驗證成功
 */
export function verifyCredentials(username, password) {
    return username === CONFIG.ADMIN_USERNAME && password === CONFIG.ADMIN_PASSWORD;
}

/**
 * 產生 JWT Token
 * @param {Object} payload - Token 內容
 * @returns {string} JWT Token
 */
export function generateToken(payload) {
    return jwt.sign(payload, CONFIG.JWT_SECRET, { expiresIn: '24h' });
}

/**
 * 驗證 JWT Token
 * @param {string} token - JWT Token
 * @returns {Object|null} 解碼後的 payload，驗證失敗則回傳 null
 */
export function verifyToken(token) {
    try {
        return jwt.verify(token, CONFIG.JWT_SECRET);
    } catch (error) {
        return null;
    }
}

export default {
    verifyCredentials,
    generateToken,
    verifyToken
};

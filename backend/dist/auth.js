"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.comparePassword = comparePassword;
exports.generateToken = generateToken;
exports.authMiddleware = authMiddleware;
exports.apiKeyMiddleware = apiKeyMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = __importDefault(require("./db"));
const JWT_SECRET = process.env.JWT_SECRET || 'joblix_super_secret_session_key_987654321';
async function hashPassword(password) {
    return bcryptjs_1.default.hash(password, 10);
}
async function comparePassword(password, hash) {
    return bcryptjs_1.default.compare(password, hash);
}
function generateToken(userId) {
    return jsonwebtoken_1.default.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    }
    catch (error) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
}
async function apiKeyMiddleware(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (!apiKey || typeof apiKey !== 'string') {
        return res.status(401).json({ error: 'Unauthorized: Missing API Key' });
    }
    try {
        const project = await db_1.default.project.findUnique({
            where: { apiKey }
        });
        if (!project) {
            return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
        }
        req.projectId = project.id;
        next();
    }
    catch (error) {
        return res.status(500).json({ error: 'Internal Server Error during api-key check' });
    }
}

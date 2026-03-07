const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const JWT_SECRET = process.env.JWT_SECRET || 'call_admin_secret_2024';
const JWT_EXPIRES = '8h';

// ── POST /api/admin/login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password)
        return res.status(400).json({ message: 'Username and password required' });

    try {
        const admin = await Admin.findOne({ username });
        if (!admin)
            return res.status(401).json({ message: 'Invalid credentials' });

        const match = await admin.matchPassword(password);
        if (!match)
            return res.status(401).json({ message: 'Invalid credentials' });

        const token = jwt.sign({ id: admin._id, username: admin.username }, JWT_SECRET, {
            expiresIn: JWT_EXPIRES,
        });

        res.json({ token, username: admin.username });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// ── POST /api/admin/seed ─────────────────────────────────────────────────────
// One-time route to create the default admin account. Remove after first use.
router.post('/seed', async (req, res) => {
    try {
        const exists = await Admin.findOne({ username: 'admin' });
        if (exists) return res.status(400).json({ message: 'Admin already exists' });

        const admin = new Admin({ username: 'admin', password: 'admin123' });
        await admin.save();
        res.json({ message: 'Admin created: username=admin  password=admin123' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── GET /api/admin/verify ────────────────────────────────────────────────────
router.get('/verify', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ message: 'No token' });
    try {
        const token = auth.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ valid: true, username: decoded.username });
    } catch {
        res.status(401).json({ valid: false, message: 'Invalid or expired token' });
    }
});

// ── POST /api/admin/users ─────────────────────────────────────────────────────
// Create a new admin user (requires valid JWT)
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ message: 'No token' });
    try {
        req.admin = jwt.verify(auth.split(' ')[1], JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ message: 'Invalid or expired token' });
    }
}

router.post('/users', authMiddleware, async (req, res) => {
    const { serviceName, phoneNumber, password } = req.body;
    if (!serviceName || !phoneNumber || !password)
        return res.status(400).json({ message: 'serviceName, phoneNumber and password are required' });
    try {
        const exists = await Admin.findOne({ username: serviceName });
        if (exists) return res.status(409).json({ message: `Service "${serviceName}" already exists` });
        const admin = new Admin({ username: serviceName, password, phoneNumber });
        await admin.save();
        res.status(201).json({ message: `User "${serviceName}" created successfully` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
// List all admin users (requires valid JWT)
router.get('/users', authMiddleware, async (req, res) => {
    try {
        const users = await Admin.find({}, 'username createdAt');
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

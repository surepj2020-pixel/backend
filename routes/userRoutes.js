const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'call_admin_secret_2024';

// ── Auth middleware ───────────────────────────────────────────────────────────
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

// ── POST /api/users/login  — Login with phone + password ─────────────────────
router.post('/login', async (req, res) => {
    const { phoneNumber, password } = req.body;
    if (!phoneNumber || !password)
        return res.status(400).json({ message: 'phoneNumber and password required' });
    try {
        const user = await User.findOne({ phoneNumber });
        if (!user) return res.status(401).json({ message: 'Invalid phone number or password' });
        if (!user.isActive) return res.status(403).json({ message: 'Account is inactive. Contact admin.' });

        const match = await user.matchPassword(password);
        if (!match) return res.status(401).json({ message: 'Invalid phone number or password' });

        const token = jwt.sign(
            { id: user._id, phoneNumber: user.phoneNumber, serviceName: user.serviceName },
            JWT_SECRET,
            { expiresIn: '30d' }
        );
        res.json({ token, serviceName: user.serviceName, phoneNumber: user.phoneNumber });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── POST /api/users  — Create a new user ─────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
    const { serviceName, phoneNumber, password } = req.body;
    if (!serviceName || !phoneNumber || !password)
        return res.status(400).json({ message: 'serviceName, phoneNumber and password are required' });

    try {
        const exists = await User.findOne({ phoneNumber });
        if (exists)
            return res.status(409).json({ message: `Phone number ${phoneNumber} already registered` });

        const user = new User({ serviceName, phoneNumber, password });
        await user.save();
        res.status(201).json({ message: `User "${serviceName}" created`, userId: user._id });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── GET /api/users  — List all users ─────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
    try {
        const users = await User.find({}, '-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── GET /api/users/:id ────────────────────────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.params.id, '-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── PATCH /api/users/:id  — Toggle active / update ───────────────────────────
router.patch('/:id', authMiddleware, async (req, res) => {
    try {
        const update = {};
        if (req.body.isActive !== undefined) update.isActive = req.body.isActive;
        if (req.body.serviceName) update.serviceName = req.body.serviceName;
        const user = await User.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after', select: '-password' });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── DELETE /api/users/:id ─────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ message: `User "${user.serviceName}" deleted` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const WhatsAppRoute = require('../models/WhatsAppRoute');

// ── GET /api/whatsapp  — List all configs ──────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const configs = await WhatsAppRoute.find().sort({ createdAt: -1 });
        res.json(configs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── POST /api/whatsapp  — Create a new config ──────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { serviceNumber, whatsappNumbers, cycleCount } = req.body;

        if (!serviceNumber) {
            return res.status(400).json({ message: 'serviceNumber is required' });
        }
        if (!whatsappNumbers || whatsappNumbers.length === 0) {
            return res.status(400).json({ message: 'At least one whatsappNumber is required' });
        }

        const config = new WhatsAppRoute({
            serviceNumber,
            whatsappNumbers,
            cycleCount: cycleCount || 3,
        });

        await config.save();
        res.status(201).json(config);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ message: 'A config for this service number already exists' });
        }
        res.status(500).json({ message: err.message });
    }
});

// ── PUT /api/whatsapp/:id  — Update a config ───────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const { whatsappNumbers, cycleCount, resetCycle } = req.body;

        const update = {};
        if (whatsappNumbers !== undefined) update.whatsappNumbers = whatsappNumbers;
        if (cycleCount !== undefined) update.cycleCount = cycleCount;

        // Allow admin to manually reset the current cycle state
        if (resetCycle) {
            update.currentIndex = 0;
            update.currentBatchCount = 0;
            update.currentBatch = [];
        }

        const config = await WhatsAppRoute.findByIdAndUpdate(
            req.params.id,
            { $set: update },
            { returnDocument: 'after', runValidators: true }
        );

        if (!config) return res.status(404).json({ message: 'Config not found' });
        res.json(config);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── DELETE /api/whatsapp/:id  — Delete a config ────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const config = await WhatsAppRoute.findByIdAndDelete(req.params.id);
        if (!config) return res.status(404).json({ message: 'Config not found' });
        res.json({ message: 'Config deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

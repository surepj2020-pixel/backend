const express = require('express');
const router = express.Router();
const CallLog = require('../models/CallLog');
const User = require('../models/User');
const WhatsAppRoute = require('../models/WhatsAppRoute');

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WA_FROM = process.env.TWILIO_WHATSAPP_FROM; // e.g. whatsapp:+14155238886

let twilioClient = null;
if (TWILIO_SID && TWILIO_TOKEN) {
    twilioClient = require('twilio')(TWILIO_SID, TWILIO_TOKEN);
    console.log('[WA] Twilio client initialized ✅');
} else {
    console.log('[WA] Twilio not configured — running in mock mode 📵');
}

/**
 * Send a WhatsApp message via Twilio (or mock-log if not configured).
 */
async function sendWhatsApp(to, body) {
    const waTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    if (twilioClient && TWILIO_WA_FROM) {
        try {
            const msg = await twilioClient.messages.create({
                to: waTo,
                from: TWILIO_WA_FROM,
                body,
            });
            console.log(`[WA] Sent to ${waTo} — SID: ${msg.sid}`);
            return true;
        } catch (err) {
            console.error(`[WA] Twilio error: ${err.message}`);
            return false;
        }
    } else {
        console.log(`\n[WA MOCK] ─────────────────────────────`);
        console.log(`[WA MOCK] To:      ${waTo}`);
        console.log(`[WA MOCK] Message: ${body}`);
        console.log(`[WA MOCK] ─────────────────────────────\n`);
        return true;
    }
}

router.post('/', async (req, res) => {
    try {
        const { receivingNumber, userId } = req.body;
        // Strip +91 country code prefix from incoming caller number
        const incomingNumber = (req.body.incomingNumber || '').replace(/^\+91/, '');

        if (!receivingNumber || !incomingNumber) {
            return res.status(400).json({
                message: 'receivingNumber and incomingNumber are required',
            });
        }

        // Verify that the user (receivingNumber) is active
        const user = await User.findOne({ phoneNumber: receivingNumber });
        if (!user) {
            return res.status(404).json({
                message: 'Receiving number service not found. Cannot log call.',
            });
        }
        if (!user.isActive) {
            return res.status(403).json({
                message: 'Service is currently inactive. Auto-rejection disabled.',
            });
        }

        const now = new Date();

        // Upsert: find existing doc and update, or create new one
        const callLog = await CallLog.findOneAndUpdate(
            { receivingNumber, incomingNumber },
            {
                $inc: { count: 1 },
                $push: {
                    timestamps: {
                        $each: [now],
                        $slice: -200,   // keep only last 200 timestamps
                    },
                },
                $setOnInsert: {
                    userId: userId || null,
                    receivingNumber,
                    incomingNumber,
                },
            },
            { upsert: true, returnDocument: 'after' }
        );

        // ── WhatsApp Batch Routing ──────────────────────────────────────────
        try {
            console.log(`[WA-DEBUG] Looking up WA route for serviceNumber="${receivingNumber}"`);
            const waRoute = await WhatsAppRoute.findOne({ serviceNumber: receivingNumber });
            console.log(`[WA-DEBUG] waRoute found: ${waRoute ? 'YES' : 'NO'}`);

            if (waRoute && waRoute.whatsappNumbers.length > 0) {
                // Check if the incoming number is already in this cycle's batch
                const isDuplicate = waRoute.currentBatch.some(
                    (entry) => entry.callerNumber === incomingNumber
                );

                let updated = waRoute;

                if (isDuplicate) {
                    console.log(`[WA-DEBUG] Number ${incomingNumber} already in active batch. Skipping cycle increment.`);
                } else {
                    // Append this call to the current batch (atomic)
                    updated = await WhatsAppRoute.findByIdAndUpdate(
                        waRoute._id,
                        {
                            $push: { currentBatch: { callerNumber: incomingNumber, timestamp: now } },
                            $inc: { currentBatchCount: 1 },
                        },
                        { returnDocument: 'after' }
                    );
                    console.log(`[WA-DEBUG] Batch updated → count=${updated.currentBatchCount} / cycleCount=${updated.cycleCount}`);
                }

                // If we've hit the cycle count, fire the WA message and rotate
                // (Note: this works even if isDuplicate is true, in case the cycle was already fulfilled but failed to clear earlier)
                if (updated.currentBatchCount >= updated.cycleCount) {
                    const handlerNumber = updated.whatsappNumbers[updated.currentIndex];
                    const nextIndex = (updated.currentIndex + 1) % updated.whatsappNumbers.length;
                    console.log(`[WA-DEBUG] Cycle complete! Sending to handler: ${handlerNumber}`);

                    // Look up service name for this receivingNumber
                    const serviceUser = await User.findOne({ phoneNumber: receivingNumber }).select('serviceName').lean();
                    const serviceName = serviceUser ? serviceUser.serviceName : receivingNumber;

                    // Build the message body
                    const lines = updated.currentBatch.map((entry) => {
                        const ts = new Date(entry.timestamp).toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            day: 'numeric',
                            month: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                        });
                        return ` ${entry.callerNumber}  -  ${ts}`;
                    });
                    const msgBody =
                        `Service Name: ${serviceName}\n\n` +
                        lines.join('\n');

                    await sendWhatsApp(handlerNumber, msgBody);

                    // Rotate index and reset batch
                    await WhatsAppRoute.findByIdAndUpdate(waRoute._id, {
                        $set: {
                            currentIndex: nextIndex,
                            currentBatchCount: 0,
                            currentBatch: [],
                        },
                    });
                }
            }
        } catch (waErr) {
            // WA routing errors must never break the call-logging response
            console.error(`[WA] Routing error: ${waErr.message}`);
        }
        // ── End WhatsApp Batch Routing ─────────────────────────────────────

        res.status(201).json({
            message: 'Call logged',
            callLog: {
                id: callLog._id,
                receivingNumber: callLog.receivingNumber,
                incomingNumber: callLog.incomingNumber,
                count: callLog.count,
                latestTimestamp: now,
            },
        });
    } catch (err) {
        console.error(`[callRoutes] Error: ${err.message}`);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});


// ── GET /api/calls  — List all call logs ─────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const { receivingNumber, limit = 50, startDate, endDate } = req.query;

        const filter = {};
        if (receivingNumber) filter.receivingNumber = receivingNumber;

        // Apply date filtering to the most recent call (updatedAt)
        if (startDate || endDate) {
            filter.updatedAt = {};
            if (startDate) filter.updatedAt.$gte = new Date(startDate);
            if (endDate) filter.updatedAt.$lte = new Date(endDate);
        }

        const logs = await CallLog
            .find(filter)          // Include the full timestamps array
            .sort({ updatedAt: -1 })
            .limit(Number(limit))
            .lean();               // For easier manipulation

        // Manually look up User serviceNames based on receivingNumber
        // (since userId might be null from older clients backing up logs)
        const enrichedLogs = await Promise.all(logs.map(async (log) => {
            let serviceName = null;
            if (log.receivingNumber) {
                const user = await User.findOne({ phoneNumber: log.receivingNumber }).select('serviceName').lean();
                if (user) serviceName = user.serviceName;
            }
            return {
                ...log,
                serviceName: serviceName || 'Unknown Service',
            };
        }));

        res.json(enrichedLogs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── GET /api/calls/:id  — Full detail including timestamps ───────────────────
router.get('/:id', async (req, res) => {
    try {
        const log = await CallLog.findById(req.params.id);
        if (!log) return res.status(404).json({ message: 'Call log not found' });
        res.json(log);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ── GET /api/calls/by/:receivingNumber  — All calls for one number ────────────
router.get('/by/:receivingNumber', async (req, res) => {
    try {
        const logs = await CallLog
            .find({ receivingNumber: req.params.receivingNumber })
            .sort({ count: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

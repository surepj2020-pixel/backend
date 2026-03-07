const mongoose = require('mongoose');

const batchEntrySchema = new mongoose.Schema(
    {
        callerNumber: { type: String, required: true },
        timestamp: { type: Date, required: true },
    },
    { _id: false }
);

const whatsAppRouteSchema = new mongoose.Schema(
    {
        // The service phone number this config is for
        serviceNumber: { type: String, required: true, unique: true, index: true },

        // Ordered list of WhatsApp handler numbers (E.164 format)
        whatsappNumbers: { type: [String], default: [] },

        // How many calls to batch before sending to the current handler
        cycleCount: { type: Number, default: 3, min: 1 },

        // Index of the currently active WhatsApp handler
        currentIndex: { type: Number, default: 0 },

        // Number of calls received in the current (not-yet-dispatched) batch
        currentBatchCount: { type: Number, default: 0 },

        // The accumulated calls for the current batch
        currentBatch: { type: [batchEntrySchema], default: [] },
    },
    { timestamps: true }
);

module.exports = mongoose.model('WhatsAppRoute', whatsAppRouteSchema);

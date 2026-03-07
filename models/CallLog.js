const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema(
    {
        // The user who received the call (their phone number = "id")
        receivingNumber: { type: String, required: true, index: true },

        // Reference to the logged-in User document
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

        // The number that called
        incomingNumber: { type: String, required: true },

        // Total times this number has called receivingNumber
        count: { type: Number, default: 1 },

        // One timestamp per call (capped at 200 to prevent unbounded growth)
        timestamps: {
            type: [Date],
            default: [],
            validate: {
                validator: (arr) => arr.length <= 200,
                message: 'Timestamps array exceeds cap of 200',
            },
        },


    },
    { timestamps: true } // adds createdAt (first call) and updatedAt (last call)
);

// Compound index ensures one doc per (receivingNumber, incomingNumber) pair
callLogSchema.index({ receivingNumber: 1, incomingNumber: 1 }, { unique: true });

module.exports = mongoose.model('CallLog', callLogSchema);

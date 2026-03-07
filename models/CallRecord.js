const mongoose = require('mongoose');

const CallRecordSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        default: 'completed',
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('CallRecord', CallRecordSchema);

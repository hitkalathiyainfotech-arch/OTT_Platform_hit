const mongoose = require('mongoose');

const subscribeSchema = mongoose.Schema({
    email: {
        type: String,
    },
    subscribe: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    versionKey: false
});

module.exports = mongoose.model("subscribe", subscribeSchema);
const mongoose = require('mongoose');

const premiumSchema = mongoose.Schema({
    plan: {
        type: String,
        // enum: ["Free", "Basic", "Standard", "Premium"]
    },
    price: {
        type: Number,
    },
    period: {
        type: String,
    },
    features: [
        {
            name: {
                type: String,
            },
            description: {
                type: String,
            }
        }
    ],
}, {
    timestamps: true,
    versionKey: false
});

module.exports = mongoose.model("Premium", premiumSchema);
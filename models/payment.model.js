const mongoose = require('mongoose');

const paymentSchema = mongoose.Schema({
    // cardNumber: {
    //     type: Number
    // },
    PlanName: {
        type: String
    },
    cardHolder: {
        type: String
    },
    period: {
        type: String
    },
    startDate: {
        type: Date,
    },
    endDate: {
        type: Date,
    },
    amount: {
        type: Number,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    paymentMethod: {
        type: String
    },
    planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Premium'
    }
}, {
    timestamps: true,
    versionKey: false
});

module.exports = mongoose.model("payment", paymentSchema);
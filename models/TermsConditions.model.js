const mongoose = require('mongoose');

const termConditionSchema = mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    }
}, {
    timestamps: true,
    versionKey: false
});

module.exports = mongoose.model("TermCondition", termConditionSchema);
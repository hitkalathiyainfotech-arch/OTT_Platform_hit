const mongoose = require('mongoose');

const privacySchema = mongoose.Schema({
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

module.exports = mongoose.model("PrivacyPolicy", privacySchema);
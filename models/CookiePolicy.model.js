const mongoose = require('mongoose');

const cookieSchema = mongoose.Schema({
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

module.exports = mongoose.model("CookiePolicy", cookieSchema);
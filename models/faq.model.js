const mongoose = require('mongoose');

const faqSchema = mongoose.Schema({
    faqQuestion: {
        type: String,
        require: true,
    },
    faqAnswer: {
        type: String,
        require: true,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model("Faq", faqSchema);

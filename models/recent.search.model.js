const mongoose = require("mongoose");

const recentSearchSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    search: {
        type: String,
        required: true,
    }
}, { timestamps: true });

const recentSearchModel = mongoose.model("RecentSearch", recentSearchSchema);

module.exports = recentSearchModel
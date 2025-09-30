const mongoose = require('mongoose');

const FeatureSchema = mongoose.Schema({
    FeatureName: {
        type: String,
    }
}, {
    timestamps: true,
    versionKey: false
});

module.exports = mongoose.model("feature", FeatureSchema);
const mongoose = require("mongoose");

const starringSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    starring_image: {
        url: { type: String },
        public_id: { type: String }
    },
    moviesId: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Movie"
    }]
}, {
    timestamps: true,
    versionKey: false
});

module.exports = mongoose.model("Starring", starringSchema);

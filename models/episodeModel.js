const mongoose = require("mongoose");

const episodeSchema = new mongoose.Schema({
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },
    thumbnail: {
        url: { type: String },
        public_id: { type: String }
    },
    title: { type: String, required: true },
    description: { type: String },
    duration: { type: Number },
    video: {
        url: { type: String },
        public_id: { type: String }
    },
    seasonNo: { type: String, required: true },
    episodeNo: { type: String, required: true }
}, { timestamps: true });

episodeSchema.virtual('formattedDuration').get(function () {
    if (typeof this.duration !== 'number' || this.duration < 0) {
        return null; // Or handle as appropriate
    }
    const totalMinutes = Math.floor(this.duration / 60000); // Convert milliseconds to minutes
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${minutes} min`;
    } else {
        return `${minutes} min`;
    }
});

episodeSchema.set('toObject', { virtuals: true });
episodeSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model("Episode", episodeSchema);
const mongoose = require("mongoose");

const continueWatchingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    movieId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Movie",
      required: true,
    },
    episodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Episode",
      default: null,
    },
    season: { type: String },
    episode: { type: String },
    progress: { type: Number, default: 0 },
    lastWatched: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ContinueWatching", continueWatchingSchema);

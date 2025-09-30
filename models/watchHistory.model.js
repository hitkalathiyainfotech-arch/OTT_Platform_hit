const mongoose = require('mongoose');

const watchHistorySchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    movieId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Movie', 
        required: true 
    },
    season: { 
        type: Number, 
        default: null 
    },
    episode: { 
        type: Number, 
        default: null 
    },
}, { 
    timestamps: true 
});

// Index for efficient queries
watchHistorySchema.index({ userId: 1, lastWatchedAt: -1 });
watchHistorySchema.index({ userId: 1, movieId: 1 });
watchHistorySchema.index({ userId: 1, completed: 1 });

module.exports = mongoose.model('WatchHistory', watchHistorySchema); 
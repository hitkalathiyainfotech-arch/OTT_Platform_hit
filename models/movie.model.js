// import mongoose from "mongoose";
const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema({
    title: { type: String, required: true },
    thumbnail: {
        url: { type: String },
        public_id: { type: String }
    },
    poster: {
        url: { type: String },
        public_id: { type: String }
    },
    nameImage: {
        url: { type: String },
        public_id: { type: String }
    },
    video: {
        url: { type: String },
        public_id: { type: String }
    },
    trailer: {
        url: { type: String },
        public_id: { type: String }
    },
    releaseYear: { type: Number },
    duration: { type: Number },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'MovieCategory' },
    languages: [{ type: String }],
    description: { type: String },
    genre: { type: String },
    contentDescriptor: { type: String },
    director: { type: String },
    long_description: { type: String },
    type: { type: String, enum: ['movie', 'webseries'], required: true },
    views: {
        type: [{
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            timestamp: { type: Date, default: Date.now }
        }],
        default: []
    },
    starrings:[{
        type: mongoose.Schema.Types.ObjectId, ref: 'Starring' 
    }],
    rating: { type: Number, default: 0 },
    isPremium: {
        type: Boolean,
        default: true
    },
    contentRating: {
        type: String
    }
}, { timestamps: true });

movieSchema.virtual('formattedDuration').get(function () {
    if (typeof this.duration !== 'number' || this.duration < 0) {
        return null; // Or handle as appropriate
    }
    const totalMinutes = Math.floor(this.duration / 6000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${minutes} min`;
    } else {
        return `${minutes} min`;
    }
});

movieSchema.set('toObject', { virtuals: true });
movieSchema.set('toJSON', { virtuals: true });

// Add a pre-save middleware to handle the views field
movieSchema.pre('save', function (next) {
    // If views is a number, convert it to the new format
    if (typeof this.views === 'number') {
        this.views = [];
    }
    next();
});

module.exports = mongoose.model('Movie', movieSchema)

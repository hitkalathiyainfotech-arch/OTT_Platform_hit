// ... existing code ...
const User = require('../models/user.model.js');
const  Movie = require('../models/movie.model.js');
const  {ThrowError}  = require('../utils/ErrorUtils.js');
const mongoose = require('mongoose');

// ADD TO WATCHLIST
async function addToWatchlist(req, res) {
    const movieId = req.body.movieId;
    const userId = req.user._id;
    
    if (!mongoose.Types.ObjectId.isValid(movieId)) {
        return ThrowError(res, 400, 'Invalid ID')
    }

    try {
        const movie = await Movie.findById(movieId);
        if (!movie) return ThrowError(res, 404, 'Movie not found');

        const user = await User.findById(userId);
        if (!user) return ThrowError(res, 404, 'User not found');

        if (user.watchlist.some(item => item._id.toString() === movieId)) {
            user.watchlist = user.watchlist.filter(item => item._id.toString() !== movieId);
        } else {
            user.watchlist.push({ _id: movie._id, thumbnails: movie.thumbnail, title: movie.title });
        }
        
        await user.save();

        res.status(200).json({
            status: true,
            message: 'Added to watchlist',
            watchlist: user.watchlist
        });
    } catch (err) {
        return ThrowError(res, 500, 'Error saving watchlist');
    }
}

// REMOVE FROM WATCHLIST
async function removeFromWatchlist(req, res) {
    const movieId = req.body.movieId;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(movieId)) {
        return ThrowError(res, 400, 'Invalid ID')
    }

    try {
        const user = await User.findById(userId);
        if (!user) return ThrowError(res, 404, 'User not found');

        user.watchlist = user.watchlist.filter(item => item._id.toString() !== movieId);
        await user.save();
        res.status(200).json({
            status: true,
            message: 'Removed from watchlist'
        });
    } catch (err) {
        return ThrowError(res, 500, 'Error saving watchlist');
    }
}

// GET WATCHLIST
async function getWatchlist(req, res) {
    const userId = req.user._id;

    try {
        const user = await User.findById(userId).populate('watchlist');
        if (!user) return ThrowError(res, 404, 'User not found');

        res.status(200).json({
            status: true,
            message: 'get watchlist',
            watchlist: user.watchlist
        });
    } catch (err) {
        return ThrowError(res, 500, 'Error fetching watchlist');
    }
}

module.exports = {
    addToWatchlist,
    removeFromWatchlist,
    getWatchlist
};
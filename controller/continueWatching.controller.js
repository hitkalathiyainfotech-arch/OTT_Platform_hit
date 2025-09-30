const ContinueWatching = require('../models/continueWatching.model');
const userModel = require('../models/user.model');

// Add or update continue watching
const addOrUpdateContinueWatching = async (req, res) => {
    try {
        const { movieId, season, episode, progress, episodeId, userId: socketUserId } = req.body;
        const userId = req.user._id || socketUserId;

        // Upsert (update if exists, else create)
        const result = await ContinueWatching.findOneAndUpdate(
            { userId, movieId, season, episode, episodeId },
            { progress, lastWatched: new Date() },
            { upsert: true, new: true, rawResult: true }
        );

        let status;
        if (result.lastErrorObject && result.lastErrorObject.updatedExisting) {
            status = "updated";
        } else {
            status = "created";
        }
        res.status(200).json({
            status,
            data: result
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Optionally, get all continue watching for a user
const getContinueWatching = async (req, res) => {
    try {
        const userId = req.user._id;
        // Get user's parental control settings
        const user = await userModel.findById(userId);
        let parentalControlFilter = {};
        if (user && user.parentalControl && user.parentalControl.length > 0) {
            parentalControlFilter = { 'movie.contentRating': { $in: user.parentalControl } };
        }
        const data = await ContinueWatching.aggregate([
            { $match: { userId } },
            { $lookup: { from: 'movies', localField: 'movieId', foreignField: '_id', as: 'movie' } },
            { $lookup: { from: 'episodes', localField: 'episodeId', foreignField: '_id', as: 'episodeData' } },
            { $unwind: { path: '$episodeData', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$movie', preserveNullAndEmptyArrays: true } },
            { $match: parentalControlFilter },
            { $sort: { updatedAt: -1 } },
        ]);
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Remove continue watching by document _id
const removeContinueWatching = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?._id;
        console.log('Attempting to delete:', { id, userId });

        const result = await ContinueWatching.findOneAndDelete({ _id: id, userId });
        if (!result) {
            console.log('No entry found for:', { id, userId });
            return res.status(404).json({ message: 'Entry not found' });
        }
        res.status(200).json({ message: 'Removed from continue watching', id });
    } catch (err) {
        console.error('Error in removeContinueWatching:', err);
        res.status(500).json({ error: err.message });
    }
};


module.exports = {
    getContinueWatching,
    addOrUpdateContinueWatching,
    removeContinueWatching,
}


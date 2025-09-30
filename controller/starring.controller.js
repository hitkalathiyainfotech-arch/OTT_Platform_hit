const { fileupload } = require("../helper/cloudinary.js");
const Starring = require("../models/starring.model.js");
const ThrowError = require("../utils/ErrorUtils.js");
const mongoose = require("mongoose");
const fs = require("fs");

// CREATE
exports.createStarring = async (req, res) => {
    try {
        const { name } = req.body;
        const starring_image = req.file ? req.file.path : undefined;
        const filedata = await fileupload(req.file.path, "starring_image");

        // Accept multiple movie IDs
        let moviesId = [];
        if (req.body.moviesId) {
            if (Array.isArray(req.body.moviesId)) {
                moviesId = req.body.moviesId;
            } else {
                moviesId = [req.body.moviesId];
            }
        } else if (req.body.movieId) {
            moviesId = [req.body.movieId];
        }

        // Validate all IDs
        for (const id of moviesId) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return ThrowError(res, 400, 'Invalid movie ID: ' + id);
            }
        }

        // Check for duplicate by name
        const existingStarring = await Starring.findOne({ name });
        if (existingStarring) {
            return ThrowError(res, 400, 'Starring with this name already exists');
        }

        if (!filedata.message) {
            const starringDoc = new Starring({
                name,
                starring_image: {
                    url: filedata.Location,
                    public_id: filedata.ETag.replace(/"/g, '')
                },
                moviesId: moviesId
            });
            if (req.file?.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            const savedStarring = await starringDoc.save();
            if (!savedStarring) return ThrowError(res, 404, 'Actor not created');
            res.status(200).json(savedStarring);
        } else {
            return ThrowError(res, 404, 'Actor not created')
        }

    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

// GET ALL
exports.getAllStarring = async (req, res) => {
    try {
        const starrings = await Starring.find();
        if (!starrings || starrings.length === 0) return ThrowError(res, 404, 'No starrings found');
        res.json(starrings);
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

// GET BY ID
exports.getStarringById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return ThrowError(res, 400, 'Invalid starring ID');
        }
        const starringDoc = await Starring.findById(req.params.id);
        if (!starringDoc) return ThrowError(res, 404, 'Starring not found');
        res.json(starringDoc);
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

// UPDATE
exports.updateStarring = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return ThrowError(res, 400, 'Invalid starring ID');
        }
        const starringDoc = await Starring.findById(req.params.id);
        if (!starringDoc) {
            return ThrowError(res, 404, 'Starring not found');
        }

        // Handle image update
        if (req.file) {
            // Upload new image to Cloudinary
            const filedata = await fileupload(req.file.path, "starring_image");
            if (!filedata.message) {
                // Optionally: delete old image from Cloudinary using starringDoc.starring_image.public_id
                starringDoc.starring_image = {
                    url: filedata.Location,
                    public_id: filedata.ETag.replace(/"/g, '')
                };
                // Remove local file
                if (req.file?.path && fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
            } else {
                return ThrowError(res, 400, 'Image upload failed');
            }
        }

        // Handle name update
        starringDoc.name = req.body.name ?? starringDoc.name;

        // Handle moviesId update (array)
        if (req.body.moviesId) {
            let moviesId = [];
            if (Array.isArray(req.body.moviesId)) {
                moviesId = req.body.moviesId;
            } else {
                moviesId = [req.body.moviesId];
            }
            // Validate all IDs
            for (const id of moviesId) {
                if (!mongoose.Types.ObjectId.isValid(id)) {
                    return ThrowError(res, 400, 'Invalid movie ID: ' + id);
                }
            }
            starringDoc.moviesId = moviesId;
        }

        await starringDoc.save();
        res.status(200).json(starringDoc);
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

// DELETE
exports.deleteStarring = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return ThrowError(res, 400, 'Invalid starring ID');
        }
        const starringDoc = await Starring.findByIdAndDelete(req.params.id);
        if (!starringDoc) return ThrowError(res, 404, 'Starring not found');
        res.json({ success: true, message: 'Starring deleted' });
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

// Get Starring by Movie ID
exports.getStarringByMovieId = async (req, res) => {
    try {
        const { movieId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(movieId)) {
            return ThrowError(res, 400, 'Invalid movie ID');
        }

        const starrings = await Starring.find({ moviesId: movieId })
            .select('name starring_image moviesId createdAt updatedAt');

        if (!starrings || starrings.length === 0) {
            return res.status(200).json({
                status: true,
                message: "No starring found for this movie",
                data: []
            });
        }

        // Transform the data to ensure starring_image is included
        const transformedStarrings = starrings.map(starring => ({
            _id: starring._id,
            name: starring.name,
            starring_image: starring.starring_image || null,
            moviesId: starring.moviesId,
            createdAt: starring.createdAt,
            updatedAt: starring.updatedAt
        }));

        return res.status(200).json({
            status: true,
            message: "Starring fetched successfully",
            data: transformedStarrings
        });
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

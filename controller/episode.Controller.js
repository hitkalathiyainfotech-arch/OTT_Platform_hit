const Episode = require("../models/episodeModel.js");
const mongoose = require("mongoose");
const { ThrowError } = require("../utils/ErrorUtils.js");
const Movie = require("../models/movie.model.js");
const {
  fileupload,
  deleteFile,
  uploadHLSFolder,
} = require("../helper/cloudinary.js");
const dotenv = require("dotenv");
const fs = require("fs");
const { emitProgress } = require("../helper/socketManager.js");
const { convertToHLS } = require("../helper/videoConverter.js");
const path = require("path");
const fsExtra = require("fs-extra");
const { sanitize } = require("../utils/sanitize");

function cleanupUploadedFiles(req) {
  if (req.files) {
    Object.keys(req.files).forEach((field) => {
      req.files[field].forEach((file) => {
        if (file.path && fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
            console.log(`Deleted file: ${file.path}`);
          } catch (err) {
            console.error(`Failed to delete file: ${file.path}`, err);
          }
        }
      });
    });
  }
  if (req.file && req.file.path && fs.existsSync(req.file.path)) {
    try {
      fs.unlinkSync(req.file.path);
      console.log(`Deleted file: ${req.file.path}`);
    } catch (err) {
      console.error(`Failed to delete file: ${req.file.path}`, err);
    }
  }
}

// Create a new episode
exports.createEpisode = async function (req, res) {
  try {
    const { movieId, title, description, duration, seasonNo, episodeNo } =
      req.body;

    // let durationData

    if (!movieId || !title || !seasonNo || !episodeNo) {
      return ThrowError(
        res,
        400,
        "Missing required fields: movieId, title, seasonNo, and episodeNo are required"
      );
    }

    if (!req.files || !req.files.thumbnail) {
      return ThrowError(res, 400, "Thumbnail and video files are required.");
    }

    // Upload thumbnail to Cloudinary
    const thumbFile = req.files.thumbnail[0];
    // const videoFile = req.files.video[0];

    const thumbData = await fileupload(thumbFile.path, "EpisodeThumbnail");
    // const videoData = await fileupload(videoFile.path, "EpisodeVideo");
    // console.log(thumbData, videoData);

    // Clean up local files
    if (thumbFile.path && fs.existsSync(thumbFile.path)) {
      fs.unlinkSync(thumbFile.path);
    }

    // if (videoFile.path && fs.existsSync(videoFile.path)) {
    //   fs.unlinkSync(videoFile.path);
    // }

    // console.log(videoData, "=========================");

    if (thumbData.message) {
      return ThrowError(res, 500, "File upload failed");
    }

    if (!mongoose.Types.ObjectId.isValid(movieId)) {
      return ThrowError(res, 400, "Invalid movie/webseries ID");
    }

    const parentContent = await Movie.findById(movieId);
    if (!parentContent) {
      return ThrowError(res, 404, "Parent movie or webseries not found");
    }

    // console.log("sdfkjdsgfsjkhfgsjdfhgsjdfhgsjdfgh");

    // Check for duplicate title in the same movie
    // const existingEpisodeWithTitle = await Episode.findOne({
    //   movieId,
    //   title: { $regex: new RegExp(`^${title}$`, "i") },
    // });
    // if (existingEpisodeWithTitle) {
    //   return ThrowError(
    //     res,
    //     400,
    //     "An episode with this title already exists for this movie/webseries"
    //   );
    // }

    // Check for duplicate episode number in the same season

    // console.log("-----------------");

    const existingEpisodeWithNumber = await Episode.findOne({
      movieId,
      seasonNo,
      episodeNo,
    });
    if (existingEpisodeWithNumber) {
      return ThrowError(
        res,
        400,
        "An episode with this season and episode number already exists"
      );
    }

    // console.log("jikoijihuj");

    const episode = new Episode({
      movieId,
      thumbnail: {
        url: thumbData.Location,
        public_id: thumbData.public_id,
      },
      title,
      description,
      duration: 0,
      // video: { url: videoData.url, public_id: videoData.public_id },
      seasonNo,
      episodeNo,
    });

    const savedEpisode = await episode.save();
    await savedEpisode.populate("movieId");

    res.status(201).json({
      status: true,
      message: "Episode created successfully",
      data: savedEpisode,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

exports.uploadEpisode = async (req, res) => {
  try {
    const { episodeId } = req.params;
    const { uploadType } = req.body;
    const userId = req.user._id;

    // console.log(req.body);
    if (!mongoose.Types.ObjectId.isValid(episodeId)) {
      cleanupUploadedFiles(req);
      return ThrowError(res, 400, "Invalid movie ID");
    }

    const movie = await Episode.findById(episodeId);
    if (!movie) {
      cleanupUploadedFiles(req);
      return ThrowError(res, 404, "Episode not found");
    }

    if (!req.files || !req.files[uploadType] || !req.files[uploadType][0]) {
      return ThrowError(res, 400, `No ${uploadType} file provided`);
    }

    const file = req.files[uploadType][0];

    // Update movie status to uploading
    movie.uploadStatus = "uploading";
    await movie.save();

    // Step 1: Convert to HLS
    const baseHlsOutput = path.join("hls_output", `${episodeId}_${Date.now()}`);
    const safeTitle = sanitize(movie.title || "video");
    const fullHlsDirPath = path.join(baseHlsOutput, safeTitle);

    const { duration } = await convertToHLS(
      file.path,
      baseHlsOutput,
      movie.title,
      userId
    );

    console.log(fullHlsDirPath, duration, "hlsDir");

    const { masterUrl, files, public_id } = await uploadHLSFolder(
      fullHlsDirPath, // Pass the correct path to the HLS files
      "MovieVideos",
      movie.title,
      userId
    );

    movie.video = {
      url: masterUrl,
      files,
      public_id, // all HLS files and their URLs
    };

    movie.uploadStatus = "completed";
    movie.duration = duration;
    const movieData = await movie.save();
    await movieData.populate("movieId");

    fsExtra.removeSync(file.path);
    console.log(`Attempting to remove HLS directory: ${baseHlsOutput}`);
    try {
      await fsExtra.remove(baseHlsOutput);
      console.log(`Successfully removed HLS directory: ${baseHlsOutput}`);
    } catch (cleanupError) {
      console.error(
        `Error during HLS directory cleanup for ${baseHlsOutput}:`,
        cleanupError
      );
      // Log the error but don't re-throw, as the main operation was successful
    }

    // Upload to Cloudinary
    // const filedata = await fileupload(file.path, "EpisodeVideo",(progress) => {
    //   const data = {
    //     progress,
    //     episodeId,
    //     movieName:movie.title
    //   }
    //   emitProgress(data)
    // });

    // movie.video = {
    //   url: filedata.url,
    //   public_id: filedata.public_id,
    // };
    // movie.duration = filedata.duration;

    // if (filedata.message) {
    //   movie.uploadStatus = 'failed';
    //   await movie.save();
    //   fs.unlinkSync(file.path);
    //   return ThrowError(res, 500, "Upload failed");
    // }

    // Update movie with video data

    return res.status(200).json({
      status: true,
      message: `${uploadType} uploaded successfully`,
      data: movieData,
    });
  } catch (error) {
    cleanupUploadedFiles(req);
    return ThrowError(res, 500, error.message);
  }
};

// Update an episode
exports.updateEpisode = async function (req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return ThrowError(res, 400, "Invalid episode ID");
    }

    const { movieId, title, description, duration, seasonNo, episodeNo } =
      req.body;
    const episode = await Episode.findById(req.params.id);
    if (!episode) {
      return ThrowError(res, 404, "Episode not found");
    }

    // Handle new thumbnail upload
    if (req.files && req.files.thumbnail) {
      // Delete old thumbnail from Cloudinary
      if (episode.thumbnail && episode.thumbnail.public_id) {
        await deleteFile(episode.thumbnail.public_id);
      }
      const thumbFile = req.files.thumbnail[0];
      const thumbData = await fileupload(thumbFile.path, "EpisodeThumbnail");
      if (thumbFile.path && fs.existsSync(thumbFile.path))
        fs.unlinkSync(thumbFile.path);
      if (!thumbData.message) {
        episode.thumbnail = {
          url: thumbData.Location,
          public_id: thumbData.public_id,
        };
      }
    }
    // Update other fields
    episode.movieId = movieId ?? episode.movieId;
    episode.title = title ?? episode.title;
    episode.description = description ?? episode.description;
    // episode.duration = 0;
    // duration !== undefined ? parseInt(duration) : episode.duration;
    episode.seasonNo = seasonNo ?? episode.seasonNo;
    episode.episodeNo = episodeNo ?? episode.episodeNo;

    const updatedEpisode = await episode.save();
    await updatedEpisode.populate("movieId");
    res.status(200).json(updatedEpisode);
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// // Get all episodes (optional: filter by movieId)
exports.getAllEpisodes = async function (req, res) {
  try {
    const { movieId } = req.query;
    let query = {};
    if (movieId) {
      if (!mongoose.Types.ObjectId.isValid(movieId)) {
        return ThrowError(res, 400, "Invalid movie/webseries ID");
      }
      query.movieId = movieId;
    }
    const episodes = await Episode.find(query).populate("movieId");
    if (!episodes || episodes.length === 0) {
      return ThrowError(res, 404, "No episodes found");
    }

    const getBySeason = episodes.reduce((acc, episode) => {
      const season = episode.seasonNo;
      if (!acc[season]) {
        acc[season] = [];
      }
      acc[season].push(episode);
      return acc;
    }, {});

    res.status(200).json({
      status: true,
      message: "Episodes fetched successfully",
      data: getBySeason,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

exports.getEpisodeById = async function (req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return ThrowError(res, 400, "Invalid episode ID");
    }
    const episode = await Episode.findById(req.params.id).populate("movieId");
    if (!episode) {
      return ThrowError(res, 404, "Episode not found");
    }
    res.status(200).json(episode);
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Delete an episode
exports.deleteEpisode = async function (req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return ThrowError(res, 400, "Invalid episode ID");
    }

    // Find the episode first to get the file URLs
    const episode = await Episode.findById(req.params.id);
    if (!episode) {
      return ThrowError(res, 404, "Episode not found");
    }

    // Delete files from Cloudinary
    try {
      // Delete thumbnail
      if (episode.thumbnail && episode.thumbnail.public_id) {
        await deleteFile(episode.thumbnail.public_id);
      }

      // Delete video
      if (episode.video && episode.video.public_id) {
        await deleteFile(episode.video.public_id);
      }
    } catch (cloudError) {
      console.error("Error deleting files from Cloudinary:", cloudError);
      // Continue with episode deletion even if Cloudinary deletion fails
    }

    // Delete the episode from database
    const deletedEpisode = await Episode.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: true,
      message: "Episode and associated files deleted successfully",
      data: {
        episode: deletedEpisode,
      },
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

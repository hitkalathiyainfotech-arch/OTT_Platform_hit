const mongoose = require("mongoose");
const Movie = require("../models/movie.model.js");
const MovieCategory = require("../models/movieCategory.model.js");
const userModel = require("../models/user.model.js");
const { ThrowError } = require("../utils/ErrorUtils.js");
const { fileupload, deleteFile } = require("../helper/cloudinary");
const Episode = require("../models/episodeModel");
const Starring = require("../models/starring.model.js");
const fs = require("fs");
const fsExtra = require("fs-extra");
const { convertToHLS } = require("../helper/videoConverter");
const { uploadHLSFolder } = require("../helper/cloudinary");
const path = require("path");
const ContinueWatching = require("../models/continueWatching.model.js");
const Subscriber = require("../models/Subscribe.model.js");
const { formatMovieObject } = require("../utils/sanitize");
const movieModel = require("../models/movie.model.js");
const recentSearchModel = require("../models/recent.search.model.js");

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

exports.createMovie = async (req, res) => {
  try {
    // Parse fields
    const {
      title,
      releaseYear,
      category,
      languages,
      description,
      genre,
      contentDescriptor,
      director,
      long_description,
      type,
      isPremium,
      contentRating,
    } = req.body;

    // Parse starring array
    let starringArr = [];
    if (req.body.starring) {
      starringArr = JSON.parse(req.body.starring);
    }

    // Input validation
    if (!title || !category || !languages || !description) {
      cleanupUploadedFiles(req);
      return ThrowError(res, 400, "Missing required fields");
    }

    // Validate category
    if (!mongoose.Types.ObjectId.isValid(category)) {
      cleanupUploadedFiles(req);
      return ThrowError(res, 400, "Invalid category ID");
    }

    const categoryExists = await MovieCategory.findById(category);
    if (!categoryExists) {
      cleanupUploadedFiles(req);
      return ThrowError(res, 404, "Category not found");
    }

    // Check for duplicate movie (by title)
    const existingMovie = await Movie.findOne({ title });
    if (existingMovie) {
      cleanupUploadedFiles(req);
      return ThrowError(res, 400, "A movie with this title already exists");
    }

    // Handle file uploads
    let thumbnail, poster, nameImage, durationData, trailer;
    if (req.files) {
      // Thumbnail
      if (req.files.thumbnail && req.files.thumbnail[0]) {
        const filedata = await fileupload(
          req.files.thumbnail[0].path,
          "MovieThumbnails"
        );
        if (!filedata.message) {
          thumbnail = {
            url: filedata.Location,
            public_id: filedata.public_id,
          };
        }
        fs.unlinkSync(req.files.thumbnail[0].path);
      }
      // Poster
      if (req.files.poster && req.files.poster[0]) {
        const filedata = await fileupload(
          req.files.poster[0].path,
          "MoviePoster"
        );
        if (!filedata.message) {
          poster = {
            url: filedata.Location,
            public_id: filedata.public_id,
          };
        }
        fs.unlinkSync(req.files.poster[0].path);
      }
      // Name Image
      if (req.files.nameImage && req.files.nameImage[0]) {
        const filedata = await fileupload(
          req.files.nameImage[0].path,
          "MovieNameImage"
        );
        if (!filedata.message) {
          nameImage = {
            url: filedata.Location,
            public_id: filedata.public_id,
          };
        }
        fs.unlinkSync(req.files.nameImage[0].path);
      }

      //trailer
      if (req.files.trailer && req.files.trailer[0]) {
        const filedata = await fileupload(
          req.files.trailer[0].path,
          "MovieTrailer"
        );
        if (!filedata.message) {
          trailer = {
            url: filedata.Location,
            public_id: filedata.public_id,
          };
        }
        fs.unlinkSync(req.files.trailer[0].path);
      }
    }

    const movie = new Movie({
      title,
      thumbnail,
      nameImage,
      poster,
      releaseYear: releaseYear
        ? parseInt(releaseYear)
        : new Date().getFullYear(),
      duration: 0,
      category,
      languages: Array.isArray(languages) ? languages : languages.split(","),
      description,
      genre,
      contentDescriptor,
      director,
      long_description,
      type,
      isPremium,
      contentRating,
      trailer,
    });

    const savedMovie = await movie.save();
    // await savedMovie.populate("category");

    // Fetch subscribed users
    const subscribedUsers = await Subscriber.find({ subscribe: true });
    const emailList = subscribedUsers.map((user) => user.email);

    // Send email to subscribed users
    // await sendNewMovieMail(emailList, savedMovie);

    // --- Handle starring (existing and new) ---
    let starringList = [];
    const starringImages = req.files?.starring_image || [];
    let imageIdx = 0;

    if (starringArr.length > 0) {
      for (const star of starringArr) {
        if (star._id) {
          // Existing actor
          starringList.push(star._id);
          // Add this movie to the actor's moviesId array if not already present
          const oldStarring = await Starring.findById(star._id);
          if (oldStarring && !oldStarring.moviesId.includes(savedMovie._id)) {
            oldStarring.moviesId.push(savedMovie._id);
            await oldStarring.save();
          }
        } else if (star.isNew && star.name) {
          // New actor
          let starring_image = {};
          if (starringImages[imageIdx]) {
            const filedata = await fileupload(
              starringImages[imageIdx].path,
              "starring_image"
            );
            if (!filedata.message) {
              starring_image = {
                url: filedata.Location,
                public_id: filedata.ETag.replace(/"/g, ""),
              };
            }
            fs.unlinkSync(starringImages[imageIdx].path);
            imageIdx++;
          }
          const newStarring = new Starring({
            name: star.name,
            starring_image,
            moviesId: [savedMovie._id],
          });
          const savedStarring = await newStarring.save();
          starringList.push(savedStarring._id);
        }
      }
    }

    savedMovie.starrings = starringList;
    const savedMovieData = await savedMovie.save();
    await savedMovieData.populate("category");

    return res.status(201).json({
      status: true,
      message: "Movie created successfully",
      data: {
        movie: savedMovieData,
      },
    });
  } catch (error) {
    cleanupUploadedFiles(req);
    return ThrowError(res, 500, error.message);
  }
};

exports.uploadVideo = async (req, res) => {
  try {
    const { movieId } = req.params;
    const { uploadType } = req.body; // 'video' or 'trailer'
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(movieId)) {
      cleanupUploadedFiles(req);
      return ThrowError(res, 400, "Invalid movie ID");
    }

    const movie = await Movie.findById(movieId);
    if (!movie) {
      cleanupUploadedFiles(req);
      return ThrowError(res, 404, "Movie not found");
    }

    if (!req.files || !req.files[uploadType] || !req.files[uploadType][0]) {
      return ThrowError(res, 400, `No ${uploadType} file provided`);
    }

    const file = req.files[uploadType][0];

    // Update movie status to uploading
    movie.uploadStatus = "uploading";
    await movie.save();

    // Step 1: Convert to HLS
    const hlsDir = path.join("hls_output", `${movieId}_${Date.now()}`);
    const { duration } = await convertToHLS(
      file.path,
      hlsDir,
      movie.title,
      userId
    );

    // Step 2: Upload HLS folder to Cloudinary
    const { masterUrl, files, public_id } = await uploadHLSFolder(
      hlsDir,
      "MovieVideos",
      movie.title,
      userId
    );

    // Step 3: Update movie with HLS info
    movie.video = {
      url: masterUrl,
      files,
      public_id, // all HLS files and their URLs
    };
    movie.duration = duration;
    movie.uploadStatus = "completed";
    const savedMovie = await movie.save();
    await savedMovie.populate("category");

    // Cleanup
    fsExtra.removeSync(file.path);
    fsExtra.removeSync(hlsDir);

    return res.status(200).json({
      status: true,
      message: `${uploadType} uploaded and converted to HLS successfully`,
      data: {
        movie: savedMovie,
        masterUrl,
        files,
      },
    });
  } catch (error) {
    cleanupUploadedFiles(req);
    return ThrowError(res, 500, error.message);
  }
};

exports.getAllMovies = async (req, res) => {
  try {
    const user = req.user;
    let query = {};

    // Apply parental control filter if user is authenticated
    if (user) {
      // Get user's parental control settings
      const userWithParentalControl = await userModel.findById(user._id);

      if (
        userWithParentalControl &&
        userWithParentalControl.parentalControl &&
        userWithParentalControl.parentalControl.length > 0
      ) {
        // Filter movies based on user's allowed content ratings
        query.contentRating = { $in: userWithParentalControl.parentalControl };
      }
    }

    const movies = await Movie.find(query).populate("category");

    if (!movies || movies.length === 0) {
      return ThrowError(res, 404, "No movies found");
    }

    res.json(movies.reverse());
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

exports.getMovieById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return ThrowError(res, 400, "Invalid movie ID");
    }

    // Aggregation pipeline
    const movieData = await Movie.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      {
        $lookup: {
          from: "moviecategories",
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "episodes",
          let: { movieId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$movieId", "$$movieId"] },
              },
            },
            { $sort: { seasonNo: 1, episodeNo: 1 } },
          ],
          as: "episodes",
        },
      },
      {
        $addFields: {
          episodes: {
            $cond: [{ $eq: ["$type", "webseries"] }, "$episodes", []],
          },
        },
      },
      {
        $lookup: {
          from: "starrings",
          let: { movieId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$$movieId", "$moviesId"] },
              },
            },
          ],
          as: "starrings",
        },
      },
    ]);

    if (!movieData || movieData.length === 0) {
      return ThrowError(res, 404, "Movie not found");
    }

    const movie = movieData[0];

    // Group episodes by seasonNo
    let allSeason = {};
    if (movie.episodes && movie.episodes.length > 0) {
      allSeason = movie.episodes.reduce((acc, ep) => {
        const season = ep.seasonNo || "Unknown Season";
        if (!acc[season]) acc[season] = [];
        acc[season].push(ep);
        return acc;
      }, {});
    }

    if (movie.episodes) {
      delete movie.episodes;
    }

    // Check premium logic
    const isPremium = movie.category?.isPremium || false;
    if (isPremium) {
      if (!user) {
        return ThrowError(res, 401, "Please login to access premium content");
      }
      const hasActiveSubscription =
        user.isSubscribed &&
        user.endDate &&
        new Date() <= new Date(user.endDate);

      if (!hasActiveSubscription) {
        return ThrowError(
          res,
          403,
          "Please subscribe to access premium content"
        );
      }
    }

    // Return with grouped episodes
    return res.status(200).json({
      status: true,
      message: "Movie fetched successfully",
      data: {
        ...movie,
        allSeason,
      },
    });
  } catch (error) {
    console.error("Error in getMovieById:", error);
    return ThrowError(res, 500, error.message);
  }
};

// UPDATE
exports.updateMovie = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      cleanupUploadedFiles(req);
      return ThrowError(res, 400, "Invalid movie ID");
    }

    const movie = await Movie.findById(req.params.id);
    if (!movie) {
      cleanupUploadedFiles(req);
      return ThrowError(res, 404, "Movie not found");
    }

    // Store original starring IDs before update
    const oldStarringIds = movie.starrings.map((s) => s.toString());

    // Handle new thumbnail upload
    if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
      // Delete old thumbnail from Cloudinary if it exists
      if (movie.thumbnail && movie.thumbnail.public_id) {
        await deleteFile(movie.thumbnail.public_id);
      }
      // Upload new thumbnail to Cloudinary
      const filedata = await fileupload(
        req.files.thumbnail[0].path,
        "MovieThumbnails"
      );
      if (!filedata.message) {
        movie.thumbnail = {
          url: filedata.Location,
          public_id: filedata.public_id,
        };
        // Remove local file
        if (
          req.files.thumbnail[0].path &&
          fs.existsSync(req.files.thumbnail[0].path)
        ) {
          fs.unlinkSync(req.files.thumbnail[0].path);
        }
      }
    }

    // Handle new video upload
    if (req.files && req.files.video && req.files.video[0]) {
      // Delete old video from Cloudinary if it exists
      if (movie.video && movie.video.public_id) {
        await deleteFile(movie.video.public_id);
      }
      // Upload new video to Cloudinary
      const filedata = await fileupload(req.files.video[0].path, "MovieVideos");
      if (!filedata.message) {
        movie.video = {
          url: filedata.Location,
          public_id: filedata.public_id,
        };
        // Remove local file
        if (req.files.video[0].path && fs.existsSync(req.files.video[0].path)) {
          fs.unlinkSync(req.files.video[0].path);
        }
      }
    }

    // Handle new trailer upload
    if (req.files && req.files.trailer && req.files.trailer[0]) {
      // Delete old video from Cloudinary if it exists
      if (movie.trailer && movie.trailer.public_id) {
        await deleteFile(movie.trailer.public_id);
      }
      // Upload new video to Cloudinary
      const filedata = await fileupload(
        req.files.trailer[0].path,
        "MovieTrailer"
      );
      if (!filedata.message) {
        movie.trailer = {
          url: filedata.Location,
          public_id: filedata.public_id,
        };
        // Remove local file
        if (
          req.files.trailer[0].path &&
          fs.existsSync(req.files.trailer[0].path)
        ) {
          fs.unlinkSync(req.files.trailer[0].path);
        }
      }
    }

    // Handle new poster upload
    if (req.files && req.files.poster && req.files.poster[0]) {
      // Delete old poster from Cloudinary if it exists
      if (movie.poster && movie.poster.public_id) {
        await deleteFile(movie.poster.public_id);
      }
      // Upload new poster to Cloudinary
      const filedata = await fileupload(
        req.files.poster[0].path,
        "MoviePoster"
      );
      if (!filedata.message) {
        movie.poster = {
          url: filedata.Location,
          public_id: filedata.public_id,
        };
        // Remove local file
        if (
          req.files.poster[0].path &&
          fs.existsSync(req.files.poster[0].path)
        ) {
          fs.unlinkSync(req.files.poster[0].path);
        }
      }
    }

    // Handle new video upload
    if (req.files && req.files.nameImage && req.files.nameImage[0]) {
      // Delete old nameImage from Cloudinary if it exists
      if (movie.nameImage && movie.nameImage.public_id) {
        await deleteFile(movie.nameImage.public_id);
      }
      // Upload new nameImage to Cloudinary
      const filedata = await fileupload(
        req.files.nameImage[0].path,
        "MovieNameImage"
      );
      if (!filedata.message) {
        movie.nameImage = {
          url: filedata.Location,
          public_id: filedata.public_id,
        };
        // Remove local file
        if (
          req.files.nameImage[0].path &&
          fs.existsSync(req.files.nameImage[0].path)
        ) {
          fs.unlinkSync(req.files.nameImage[0].path);
        }
      }
    }

    // Update other fields
    movie.title = req.body.title ?? movie.title;
    movie.releaseYear = req.body.releaseYear ?? movie.releaseYear;
    movie.duration = req.body.duration ?? movie.duration;
    movie.category = req.body.category ?? movie.category;
    movie.languages = req.body.languages
      ? req.body.languages.split(",")
      : movie.languages;
    movie.description = req.body.description ?? movie.description;
    movie.genre = req.body.genre ?? movie.genre;
    movie.contentDescriptor =
      req.body.contentDescriptor ?? movie.contentDescriptor;
    movie.director = req.body.director ?? movie.director;
    movie.long_description =
      req.body.long_description ?? movie.long_description;
    movie.type = req.body.type ?? movie.type;
    movie.isPremium = req.body.isPremium ?? movie.isPremium;
    movie.contentRating = req.body.contentRating ?? movie.contentRating;

    // --- Handle starring (add, update, remove) ---
    let starringArr = [];
    if (req.body.starring) {
      starringArr = JSON.parse(req.body.starring);
    }
    let starringList = [];
    const starringImages = req.files?.starring_image || [];
    let imageIdx = 0;

    // 1. Add/update starring
    for (const star of starringArr) {
      if (star._id) {
        // Existing actor
        starringList.push(star._id);
        // Add this movie to the actor's moviesId array if not already present
        const oldStarring = await Starring.findById(star._id);
        if (oldStarring && !oldStarring.moviesId.includes(movie._id)) {
          oldStarring.moviesId.push(movie._id);
          await oldStarring.save();
        }
      } else if (star.isNew && star.name) {
        // New actor
        let starring_image = {};
        if (starringImages[imageIdx]) {
          const filedata = await fileupload(
            starringImages[imageIdx].path,
            "starring_image"
          );
          if (!filedata.message) {
            starring_image = {
              url: filedata.Location,
              public_id: filedata.public_id,
            };
          }
          fs.unlinkSync(starringImages[imageIdx].path);
          imageIdx++;
        }
        const newStarring = new Starring({
          name: star.name,
          starring_image,
          moviesId: [movie._id],
        });
        const savedStarring = await newStarring.save();
        starringList.push(savedStarring._id);
      }
    }

    const removedStarringIds = oldStarringIds.filter(
      (id) => !starringList.includes(id)
    );

    for (const removedId of removedStarringIds) {
      const removedStarring = await Starring.findById(removedId);
      if (removedStarring) {
        removedStarring.moviesId = removedStarring.moviesId.filter(
          (mId) => mId.toString() !== movie._id.toString()
        );
        await removedStarring.save();
      }
    }

    movie.starrings = starringList;
    const movieData = await movie.save();
    await movieData.populate("category");

    return res.status(200).json({
      status: true,
      message: "Movie updated successfully",
      data: {
        movie: movieData,
        fileInfo: req.files
          ? {
            thumbnail: req.files.thumbnail
              ? {
                url: movie.thumbnail?.url,
                type: req.files.thumbnail[0]?.mimetype,
              }
              : null,
            video: req.files.video
              ? {
                url: movie.video?.url,
                type: req.files.video[0]?.mimetype,
              }
              : null,
          }
          : null,
      },
    });
  } catch (error) {
    cleanupUploadedFiles(req);
    return ThrowError(res, 500, error.message);
  }
};

// DELETE
exports.deleteMovie = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return ThrowError(res, 400, "Invalid movie ID");
    }

    const deletedMovie = await Movie.findByIdAndDelete(req.params.id);
    if (!deletedMovie) return ThrowError(res, 404, "Movie not found");

    // Delete files from Cloudinary
    if (deletedMovie.thumbnail && deletedMovie.thumbnail.public_id) {
      await deleteFile(deletedMovie.thumbnail.public_id);
    }
    if (deletedMovie.video && deletedMovie.video.public_id) {
      await deleteFile(deletedMovie.video.public_id);
    }
    if (deletedMovie.trailer && deletedMovie.trailer.public_id) {
      await deleteFile(deletedMovie.trailer.public_id);
    }

    res.json({
      status: true,
      message: "Movie deleted successfully",
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Get Trending movie and Webserise
exports.getTrending = async (req, res) => {
  try {
    const user = req.user;
    let query = {};
    let personalizedMovies = [];
    let otherMovies = [];

    // Apply parental control filter if user is authenticated
    if (user) {
      // Get user's parental control settings
      const userWithParentalControl = await userModel.findById(user._id);

      if (
        userWithParentalControl &&
        userWithParentalControl.parentalControl &&
        userWithParentalControl.parentalControl.length > 0
      ) {
        // Filter movies based on user's allowed content ratings
        query.contentRating = { $in: userWithParentalControl.parentalControl };
      }

      // Get user's wishlist movies
      const wishlistMovies = userWithParentalControl.watchlist || [];
      const continueWatchingMovies = await ContinueWatching.find({
        userId: user._id,
      });
      const genres = new Set();

      // Extract genres from wishlist movies
      wishlistMovies.forEach((movie) => {
        if (movie.genre) {
          movie.genre.split(",").forEach((g) => genres.add(g.trim()));
        }
      });

      // Extract movieIds from continue watching movies
      const continueWatchingMovieIds = continueWatchingMovies.map(
        (movie) => movie.movieId
      );

      // Fetch movies from the Movie model based on continue watching movieIds
      const continueWatchingMoviesDetails = await Movie.find({
        _id: { $in: continueWatchingMovieIds },
      });

      // Extract genres from continue watching movies
      continueWatchingMoviesDetails.forEach((movie) => {
        if (movie.genre) {
          movie.genre.split(",").forEach((g) => genres.add(g.trim()));
        }
      });

      // Add genre filter to the query
      if (genres.size > 0) {
        query.genre = { $in: Array.from(genres) };
      }
      // Fetch personalized trending movies
      personalizedMovies = await Movie.find(query)
        .sort({ views: -1 })
        .limit(10)
        .populate("category");

      // If query is not empty, also fetch other trending movies not in personalizedMovies
      if (Object.keys(query).length > 0) {
        // Exclude movies already in personalizedMovies
        const personalizedIds = personalizedMovies.map((m) => m._id);
        let otherQuery = {
          _id: { $nin: personalizedIds },
        };
        // If parental control is set, keep that filter for "other" movies
        if (query.contentRating) {
          otherQuery.contentRating = query.contentRating;
        }
        // Do NOT include the genre filter for "other" movies
        otherMovies = await Movie.find(otherQuery)
          .sort({ views: -1 })
          .limit(20) // fetch more to ensure enough after deduplication
          .populate("category");
      }
    } else {
      // Not authenticated, just fetch trending
      personalizedMovies = await Movie.find({})
        .sort({ views: -1 })
        .limit(10)
        .populate("category");
    }

    // Merge personalizedMovies and otherMovies, ensuring no duplicates, and limit to 10
    let trendingMovies = [...personalizedMovies];
    if (otherMovies && otherMovies.length > 0) {
      const personalizedIdsSet = new Set(
        personalizedMovies.map((m) => m._id.toString())
      );
      for (const movie of otherMovies) {
        if (trendingMovies.length >= 10) break;
        if (!personalizedIdsSet.has(movie._id.toString())) {
          trendingMovies.push(movie);
        }
      }
    }
    // If less than 10, fill with more general trending if possible
    if (trendingMovies.length < 10) {
      const alreadyIds = new Set(trendingMovies.map((m) => m._id.toString()));
      const fillMovies = await Movie.find({})
        .sort({ views: -1 })
        .limit(20)
        .populate("category");
      for (const movie of fillMovies) {
        if (trendingMovies.length >= 10) break;
        if (!alreadyIds.has(movie._id.toString())) {
          trendingMovies.push(movie);
        }
      }
    }

    // Only return 10 movies
    trendingMovies = trendingMovies.slice(0, 10);

    // Fetch seasons and episodes for webseries
    const moviesWithEpisodeSummary = await Promise.all(
      trendingMovies.map(async (movie) => {
        const movieObj = movie.toObject();
        if (movie.type === "webseries") {
          const episodes = await Episode.find({ movieId: movie._id }).sort({
            seasonNo: 1,
            episodeNo: 1,
          });
          const seasons = new Set(episodes.map((ep) => ep.seasonNo));
          movieObj.totalSeasons = seasons.size;
          movieObj.totalEpisodes = episodes.length;
        }
        return movieObj;
      })
    );

    const formattedMovies = moviesWithEpisodeSummary.map(formatMovieObject);

    return res.status(200).json({
      status: true,
      message: "Trending fetched successfully",
      data: formattedMovies,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Get Trending movie
exports.getTrendingMovie = async (req, res) => {
  try {
    const user = req.user;
    let query = { type: "movie" };
    let personalizedMovies = [];
    let otherMovies = [];

    if (user) {
      // Get user's parental control settings
      const userWithParentalControl = await userModel.findById(user._id);

      if (
        userWithParentalControl &&
        userWithParentalControl.parentalControl &&
        userWithParentalControl.parentalControl.length > 0
      ) {
        // Filter movies based on user's allowed content ratings
        query.contentRating = { $in: userWithParentalControl.parentalControl };
      }

      // Get user's wishlist movies
      const wishlistMovies = userWithParentalControl.watchlist || [];
      const continueWatchingMovies = await ContinueWatching.find({
        userId: user._id,
      });
      const genres = new Set();

      // Extract genres from wishlist movies
      wishlistMovies.forEach((movie) => {
        if (movie.genre) {
          movie.genre.split(",").forEach((g) => genres.add(g.trim()));
        }
      });

      // Extract movieIds from continue watching movies
      const continueWatchingMovieIds = continueWatchingMovies.map(
        (movie) => movie.movieId
      );

      // Fetch movies from the Movie model based on continue watching movieIds
      const continueWatchingMoviesDetails = await Movie.find({
        _id: { $in: continueWatchingMovieIds },
        type: "movie",
      });

      // Extract genres from continue watching movies
      continueWatchingMoviesDetails.forEach((movie) => {
        if (movie.genre) {
          movie.genre.split(",").forEach((g) => genres.add(g.trim()));
        }
      });

      // Add genre filter to the query
      if (genres.size > 0) {
        query.genre = { $in: Array.from(genres) };
      }

      // Fetch personalized trending movies (type: movie)
      personalizedMovies = await Movie.find(query)
        .sort({ views: -1 })
        .limit(10)
        .populate("category");

      // If query is not empty, also fetch other trending movies not in personalizedMovies
      if (Object.keys(query).length > 1 || query.genre) {
        // Exclude movies already in personalizedMovies
        const personalizedIds = personalizedMovies.map((m) => m._id);
        let otherQuery = {
          _id: { $nin: personalizedIds },
          type: "movie",
        };
        // If parental control is set, keep that filter for "other" movies
        if (query.contentRating) {
          otherQuery.contentRating = query.contentRating;
        }
        // Do NOT include the genre filter for "other" movies
        otherMovies = await Movie.find(otherQuery)
          .sort({ views: -1 })
          .limit(20)
          .populate("category");
      }
    } else {
      // Not authenticated, just fetch trending movies
      personalizedMovies = await Movie.find({ type: "movie" })
        .sort({ views: -1 })
        .limit(10)
        .populate("category");
    }

    // Merge personalizedMovies and otherMovies, ensuring no duplicates, and limit to 10
    let trendingMovies = [...personalizedMovies];
    if (otherMovies && otherMovies.length > 0) {
      const personalizedIdsSet = new Set(
        personalizedMovies.map((m) => m._id.toString())
      );
      for (const movie of otherMovies) {
        if (trendingMovies.length >= 10) break;
        if (!personalizedIdsSet.has(movie._id.toString())) {
          trendingMovies.push(movie);
        }
      }
    }
    // If less than 10, fill with more general trending if possible
    if (trendingMovies.length < 10) {
      const alreadyIds = new Set(trendingMovies.map((m) => m._id.toString()));
      const fillMovies = await Movie.find({ type: "movie" })
        .sort({ views: -1 })
        .limit(20)
        .populate("category");
      for (const movie of fillMovies) {
        if (trendingMovies.length >= 10) break;
        if (!alreadyIds.has(movie._id.toString())) {
          trendingMovies.push(movie);
        }
      }
    }

    // Only return 10 movies
    trendingMovies = trendingMovies.slice(0, 10);

    return res.status(200).json({
      status: true,
      message: "Trending movie fetched successfully",
      data: trendingMovies,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

exports.getAllTrending = async (req, res) => {
  try {
    const user = req.user;
    let query = {}; // ✅ No type filter (fetch all movies & webseries)

    // Apply parental control filter if user is authenticated
    if (user) {
      const userWithParentalControl = await userModel.findById(user._id);

      if (
        userWithParentalControl &&
        Array.isArray(userWithParentalControl.parentalControl) &&
        userWithParentalControl.parentalControl.length > 0
      ) {
        query.contentRating = { $in: userWithParentalControl.parentalControl };
      }
    }

    const trendingSeriesOrMovies = await Movie.find(query)
      .sort({ views: -1 })
      .limit(10)
      .populate("category");

    if (!trendingSeriesOrMovies || trendingSeriesOrMovies.length === 0) {
      return ThrowError(res, 404, "No trending content found");
    }

    // Add episode & season summary only for webseries
    const contentWithDetails = await Promise.all(
      trendingSeriesOrMovies.map(async (item) => {
        const itemObj = item.toObject();

        if (item.type === "webseries") {
          const episodes = await Episode.find({ movieId: item._id }).sort({
            seasonNo: 1,
            episodeNo: 1,
          });

          const seasons = new Set(episodes.map((ep) => ep.seasonNo));
          itemObj.totalSeasons = seasons.size;
          itemObj.totalEpisodes = episodes.length;
        }

        return itemObj;
      })
    );

    return res.status(200).json({
      status: true,
      message: "Trending content fetched successfully",
      data: contentWithDetails,
    });
  } catch (error) {
    console.error("Trending Fetch Error:", error);
    return ThrowError(res, 500, error.message || "Server error while fetching trending content");
  }
};



// Get Trending series
exports.getTrendingSeries = async (req, res) => {
  try {
    const user = req.user;
    let query = { type: "webseries" }; // Added query with type: "webseries"

    // Apply parental control filter if user is authenticated
    if (user) {
      // Get user's parental control settings
      const userWithParentalControl = await userModel.findById(user._id);

      if (
        userWithParentalControl &&
        userWithParentalControl.parentalControl &&
        userWithParentalControl.parentalControl.length > 0
      ) {
        // Filter movies based on user's allowed content ratings
        query.contentRating = { $in: userWithParentalControl.parentalControl };
      }
    }

    const trendingSeries = await Movie.find(query)
      .sort({ views: -1 })
      .limit(10)
      .populate("category");

    if (!trendingSeries || trendingSeries.length === 0) {
      return ThrowError(res, 404, "No webseries found");
    }

    const seriesWithEpisodeSummary = await Promise.all(
      trendingSeries.map(async (series) => {
        const seriesObj = series.toObject();
        const episodes = await Episode.find({ movieId: series._id }).sort({
          seasonNo: 1,
          episodeNo: 1,
        });

        const seasons = new Set(episodes.map((ep) => ep.seasonNo));
        seriesObj.totalSeasons = seasons.size;
        seriesObj.totalEpisodes = episodes.length;

        return seriesObj;
      })
    );

    return res.status(200).json({
      status: true,
      message: "Trending webseries fetched successfully",
      data: seriesWithEpisodeSummary,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Get Popular Series
exports.getPopularSeries = async (req, res) => {
  try {
    const user = req.user;
    let query = { type: "webseries" };
    let personalizedSeries = [];
    let otherSeries = [];

    if (user) {
      // Get user's parental control settings and watchlist
      const userWithParentalControl = await userModel.findById(user._id);

      // Parental control filter
      if (
        userWithParentalControl &&
        userWithParentalControl.parentalControl &&
        userWithParentalControl.parentalControl.length > 0
      ) {
        query.contentRating = { $in: userWithParentalControl.parentalControl };
      }

      // Gather genres from watchlist and continue watching
      const wishlistSeries = (userWithParentalControl.watchlist || []).filter(
        (item) => item.type === "webseries"
      );
      const continueWatchingSeries = await ContinueWatching.find({
        userId: user._id,
      });
      // console.log(continueWatchingSeries);

      const genres = new Set();

      // Extract genres from wishlist series
      wishlistSeries.forEach((series) => {
        if (series.genre) {
          series.genre.split(",").forEach((g) => genres.add(g.trim()));
        }
      });

      // Extract seriesIds from continue watching
      const continueWatchingSeriesIds = continueWatchingSeries.map(
        (item) => item.movieId
      );

      // Fetch series details for continue watching
      const continueWatchingSeriesDetails = await Movie.find({
        _id: { $in: continueWatchingSeriesIds },
        type: "webseries",
      });

      // Extract genres from continue watching series
      continueWatchingSeriesDetails.forEach((series) => {
        if (series.genre) {
          series.genre.split(",").forEach((g) => genres.add(g.trim()));
        }
      });

      // Add genre filter to the query if any genres found
      if (genres.size > 0) {
        query.genre = { $in: Array.from(genres) };
      }

      // Fetch personalized popular series
      personalizedSeries = await Movie.find(query)
        .sort({ views: -1 })
        .limit(10)
        .populate("category");

      // If query is not empty, also fetch other popular series not in personalizedSeries
      if (Object.keys(query).length > 0) {
        const personalizedIds = personalizedSeries.map((m) => m._id);
        let otherQuery = {
          type: "webseries",
          _id: { $nin: personalizedIds },
        };
        // If parental control is set, keep that filter for "other" series
        if (query.contentRating) {
          otherQuery.contentRating = query.contentRating;
        }
        // Do NOT include the genre filter for "other" series
        otherSeries = await Movie.find(otherQuery)
          .sort({ views: -1 })
          .limit(20)
          .populate("category");
      }
    } else {
      // Not authenticated, just fetch popular series
      personalizedSeries = await Movie.find(query)
        .sort({ views: -1 })
        .limit(10)
        .populate("category");
    }
    console.log(query);

    // Merge personalizedSeries and otherSeries, ensuring no duplicates, and limit to 10
    let popularSeries = [...personalizedSeries];
    if (otherSeries && otherSeries.length > 0) {
      const personalizedIdsSet = new Set(
        personalizedSeries.map((m) => m._id.toString())
      );
      for (const series of otherSeries) {
        if (popularSeries.length >= 10) break;
        if (!personalizedIdsSet.has(series._id.toString())) {
          popularSeries.push(series);
        }
      }
    }
    // If less than 10, fill with more general popular series if possible
    if (popularSeries.length < 10) {
      const alreadyIds = new Set(popularSeries.map((m) => m._id.toString()));
      const fillSeries = await Movie.find({ type: "webseries" })
        .sort({ views: -1 })
        .limit(20)
        .populate("category");
      for (const series of fillSeries) {
        if (popularSeries.length >= 10) break;
        if (!alreadyIds.has(series._id.toString())) {
          popularSeries.push(series);
        }
      }
    }

    // Only return 10 series
    popularSeries = popularSeries.slice(0, 10);

    // If no series found, return empty array with message
    if (!popularSeries || popularSeries.length === 0) {
      return res.status(200).json({
        status: true,
        message: "No popular series found",
        data: [],
      });
    }

    // Add episode summary
    const seriesWithEpisodeSummary = await Promise.all(
      popularSeries.map(async (series) => {
        const seriesObj = series.toObject();
        const episodes = await Episode.find({ movieId: series._id }).sort({
          seasonNo: 1,
          episodeNo: 1,
        });

        const seasons = new Set(episodes.map((ep) => ep.seasonNo));
        seriesObj.totalSeasons = seasons.size;
        seriesObj.totalEpisodes = episodes.length;
        return seriesObj;
      })
    );

    return res.status(200).json({
      status: true,
      message: "Popular series fetched successfully",
      data: seriesWithEpisodeSummary,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Get Popular Movies
exports.getPopularMovies = async (req, res) => {
  try {
    const user = req.user;
    let query = { type: "movie" }; // Added query with type: "movie"

    // Apply parental control filter if user is authenticated
    if (user) {
      // Get user's parental control settings
      const userWithParentalControl = await userModel.findById(user._id);

      if (
        userWithParentalControl &&
        userWithParentalControl.parentalControl &&
        userWithParentalControl.parentalControl.length > 0
      ) {
        // Filter movies based on user's allowed content ratings
        query.contentRating = { $in: userWithParentalControl.parentalControl };
      }
    }

    const popularMovies = await Movie.find(query)
      .sort({ rating: -1 })
      .limit(20)
      .populate("category");

    return res.status(200).json({
      status: true,
      message: "Popular movies fetched successfully",
      data: popularMovies,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Get Movies Grouped By Genre
exports.getMoviesGroupedByGenre = async (req, res) => {
  try {
    const user = req.user;
    const { type } = req.query;

    let query = {};

    if (type && ["movie", "webseries"].includes(type.toLowerCase())) {
      query.type = type.toLowerCase();
    }

    if (user) {
      const userData = await userModel.findById(user._id).lean();
      if (
        userData &&
        userData.parentalControl &&
        Array.isArray(userData.parentalControl) &&
        userData.parentalControl.length > 0
      ) {
        query.contentRating = { $in: userData.parentalControl };
      }
    }

    const movies = await movieModel.find(query).populate("category").lean();

    if (!movies || movies.length === 0) {
      return res.status(200).json({
        status: true,
        message: "No content found",
        data: {},
      });
    }

    const groupedContent = {};

    for (const movie of movies) {
      let genres = [];

      if (typeof movie.genre === "string") {
        genres = movie.genre
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean);
      } else if (Array.isArray(movie.genre)) {
        genres = movie.genre.map((g) => g.trim()).filter(Boolean);
      }

      if (genres.length === 0) genres = ["Uncategorized"];

      for (const genre of genres) {
        const formattedGenre =
          genre.charAt(0).toUpperCase() + genre.slice(1).toLowerCase();

        if (!groupedContent[formattedGenre]) groupedContent[formattedGenre] = [];
        groupedContent[formattedGenre].push(movie);
      }
    }

    for (const genre in groupedContent) {
      groupedContent[genre].sort((a, b) => {
        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        if (ratingA !== ratingB) return ratingB - ratingA;

        const viewsA = Array.isArray(a.views) ? a.views.length : 0;
        const viewsB = Array.isArray(b.views) ? b.views.length : 0;
        return viewsB - viewsA;
      });
    }

    return res.status(200).json({
      status: true,
      message: `Grouped ${type || "all"} content by genre fetched successfully`,
      data: groupedContent,
    });
  } catch (error) {
    console.error("Error fetching grouped movies by genre:", error);
    return ThrowError(res, 500, error.message);
  }
};

// Get Top Movies This Week
exports.getTopMoviesThisWeek = async (req, res) => {
  try {
    const user = req.user;
    let query = { type: "movie" }; // 👈 Ensure only movies are fetched

    // Apply parental control filter if user is authenticated
    if (user) {
      // Get user's parental control settings
      const userWithParentalControl = await userModel.findById(user._id);

      if (
        userWithParentalControl &&
        userWithParentalControl.parentalControl &&
        userWithParentalControl.parentalControl.length > 0
      ) {
        // Filter movies based on user's allowed content ratings
        query.contentRating = { $in: userWithParentalControl.parentalControl };
      }
    }

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const topMovies = await Movie.find(query)
      .sort({ views: -1 })
      .limit(10)
      .populate("category");

    // Since we are filtering only `movies`, no need for episode fetching
    const moviesWithInfo = topMovies.map((movie) => {
      const movieObj = movie.toObject();
      movieObj.totalSeasons = 0;
      movieObj.totalEpisodes = 0;
      return movieObj;
    });

    return res.status(200).json({
      status: true,
      message: "Top movies this week fetched successfully",
      data: moviesWithInfo,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};


// Get Recommended Content (personalized by most-watched genres from history and continue-watching)
exports.getRecommendedContent = async (req, res) => {
  try {
    if (!req.user) {
      return ThrowError(res, 401, "User not authenticated");
    }

    const user = await userModel.findById(req.user._id).populate({
      path: "watchlist",
      populate: { path: "category" },
    });

    if (!user) {
      return ThrowError(res, 404, "User not found");
    }

    // Collect genre/category signals from:
    // - Watchlist (explicit intent)
    // - Watch history (actual watches)
    // - Continue watching (recent intent)
    const genreCounts = new Map();
    const categoryIds = new Set();

    const incrementGenre = (genreValue) => {
      if (!genreValue) return;
      // genre stored as comma-separated string in schema
      const genreList = Array.isArray(genreValue)
        ? genreValue
        : String(genreValue)
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean);
      for (const g of genreList) {
        genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
      }
    };

    // From watchlist
    for (const m of user.watchlist || []) {
      incrementGenre(m.genre);
      if (m.category && m.category._id)
        categoryIds.add(m.category._id.toString());
    }

    // From watch history
    const WatchHistory = require("../models/watchHistory.model");
    const history = await WatchHistory.find({ userId: req.user._id }).select(
      "movieId"
    );
    const historyMovieIds = history.map((h) => h.movieId).filter(Boolean);
    if (historyMovieIds.length > 0) {
      const historyMovies = await Movie.find({
        _id: { $in: historyMovieIds },
      }).select("genre category");
      for (const m of historyMovies) {
        incrementGenre(m.genre);
        if (m.category) categoryIds.add(m.category.toString());
      }
    }

    // From continue watching
    const ContinueWatching = require("../models/continueWatching.model");
    const cw = await ContinueWatching.find({ userId: req.user._id }).select(
      "movieId"
    );
    const cwMovieIds = cw.map((c) => c.movieId).filter(Boolean);
    if (cwMovieIds.length > 0) {
      const cwMovies = await Movie.find({ _id: { $in: cwMovieIds } }).select(
        "genre category"
      );
      for (const m of cwMovies) {
        incrementGenre(m.genre);
        if (m.category) categoryIds.add(m.category.toString());
      }
    }

    // Helper to add episode summary for webseries
    const addEpisodeSummary = async (items) => {
      const Episode = require("../models/episodeModel");
      const result = await Promise.all(
        items.map(async (doc) => {
          const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
          if (obj.type === "webseries") {
            const episodes = await Episode.find({ movieId: obj._id }).sort({
              seasonNo: 1,
              episodeNo: 1,
            });
            const seasons = new Set(episodes.map((ep) => ep.seasonNo));
            obj.totalSeasons = seasons.size;
            obj.totalEpisodes = episodes.length;
          } else {
            obj.totalSeasons = obj.totalSeasons ?? 0;
            obj.totalEpisodes = obj.totalEpisodes ?? 0;
          }
          return obj;
        })
      );
      return result;
    };

    // If we have no signals at all, treat as new user: return popular content
    if (genreCounts.size === 0 && categoryIds.size === 0) {
      const popular = await Movie.find()
        .sort({ views: -1 })
        .limit(10)
        .populate("category");
      const enrichedPopular = await addEpisodeSummary(popular);
      return res.status(200).json({
        status: true,
        message: "Recommended content based on popularity",
        data: enrichedPopular,
      });
    }

    // Pick top N genres by frequency
    const topGenres = Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([g]) => g);

    // Build recommendation query
    const excludeIds = new Set([
      ...(user.watchlist || []).map((m) => m._id.toString()),
    ]);
    const orFilters = [];
    if (topGenres.length > 0) orFilters.push({ genre: { $in: topGenres } });
    if (categoryIds.size > 0)
      orFilters.push({ category: { $in: Array.from(categoryIds) } });

    let recommendations = [];
    if (orFilters.length > 0) {
      recommendations = await Movie.find({
        $or: orFilters,
        _id: { $nin: Array.from(excludeIds) },
      })
        .sort({ views: -1 })
        .limit(20)
        .populate("category");
    }

    // Backfill with popular if not enough
    if (recommendations.length < 10) {
      const backfill = await Movie.find({
        _id: { $nin: recommendations.map((m) => m._id) },
      })
        .sort({ views: -1 })
        .limit(10 - recommendations.length)
        .populate("category");
      recommendations.push(...backfill);
    }

    const enrichedRecommendations = await addEpisodeSummary(recommendations);

    return res.status(200).json({
      status: true,
      message: "Recommended content fetched successfully",
      data: enrichedRecommendations,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Get Top 10 Content
exports.getTop10Content = async (req, res) => {
  try {
    const user = req.user;
    let query = {};

    // Apply parental control filter if user is authenticated
    if (user) {
      // Get user's parental control settings
      const userWithParentalControl = await userModel.findById(user._id);

      if (
        userWithParentalControl &&
        userWithParentalControl.parentalControl &&
        userWithParentalControl.parentalControl.length > 0
      ) {
        // Filter movies based on user's allowed content ratings
        query.contentRating = { $in: userWithParentalControl.parentalControl };
      }
    }

    const top10Content = await Movie.find(query)
      .sort({ views: -1 }) // Sort by views first, then rating
      .limit(10)
      .populate("category");
    if (!top10Content || top10Content.length === 0) {
      return ThrowError(res, 404, "No top 10 content found");
    }

    // Add episode summary
    const contentWithEpisodeSummary = await Promise.all(
      top10Content.map(async (content) => {
        const contentObj = content.toObject();
        if (content.type === "webseries") {
          const episodes = await Episode.find({ movieId: content._id }).sort({
            seasonNo: 1,
            episodeNo: 1,
          });
          const seasons = new Set(episodes.map((ep) => ep.seasonNo));
          contentObj.totalSeasons = seasons.size;
          contentObj.totalEpisodes = episodes.length;
        }
        return contentObj;
      })
    );

    return res.status(200).json({
      status: true,
      message: "Top 10 content fetched successfully",
      data: contentWithEpisodeSummary,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Rate a movie
exports.rateMovie = async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return ThrowError(res, 401, "User not authenticated");
    }

    const { movieId } = req.params;
    const { rating } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(movieId)) {
      return ThrowError(res, 400, "Invalid movie ID");
    }

    if (!rating || rating < 1 || rating > 5) {
      return ThrowError(res, 400, "Rating must be between 1 and 5");
    }

    const movie = await Movie.findById(movieId);
    if (!movie) {
      return ThrowError(res, 404, "Movie not found");
    }

    // Check if user has already rated
    const existingRatingIndex = movie.ratings.findIndex(
      (r) => r.userId.toString() === userId.toString()
    );

    if (existingRatingIndex !== -1) {
      return ThrowError(
        res,
        400,
        "You have already rated this movie. Use update rating endpoint to change your rating."
      );
    }

    // Add new rating
    movie.ratings.push({
      userId,
      rating,
      createdAt: new Date(),
    });

    // Calculate new average rating
    const totalRatings = movie.ratings.length;
    const sumRatings = movie.ratings.reduce((sum, r) => sum + r.rating, 0);
    movie.rating = totalRatings > 0 ? sumRatings / totalRatings : 0;

    await movie.save();

    return res.status(200).json({
      status: true,
      message: "Rating added successfully",
      data: {
        rating: movie.rating,
        totalRatings: totalRatings,
        userRating: rating,
      },
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Update movie rating
exports.updateMovieRating = async (req, res) => {
  try {
    if (!req.user) {
      return ThrowError(res, 401, "User not authenticated");
    }

    const { movieId } = req.params;
    const { rating } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(movieId)) {
      return ThrowError(res, 400, "Invalid movie ID");
    }

    if (!rating || rating < 1 || rating > 5) {
      return ThrowError(res, 400, "Rating must be between 1 and 5");
    }

    const movie = await Movie.findById(movieId);
    if (!movie) {
      return ThrowError(res, 404, "Movie not found");
    }

    // Find user's existing rating
    const existingRatingIndex = movie.ratings.findIndex(
      (r) => r.userId.toString() === userId.toString()
    );

    if (existingRatingIndex === -1) {
      return ThrowError(res, 404, "You have not rated this movie yet");
    }

    // Update the rating
    movie.ratings[existingRatingIndex].rating = rating;
    movie.ratings[existingRatingIndex].createdAt = new Date();

    // Recalculate average rating
    const totalRatings = movie.ratings.length;
    const sumRatings = movie.ratings.reduce((sum, r) => sum + r.rating, 0);
    movie.rating = totalRatings > 0 ? sumRatings / totalRatings : 0;

    await movie.save();

    return res.status(200).json({
      status: true,
      message: "Rating updated successfully",
      data: {
        rating: movie.rating,
        totalRatings: totalRatings,
        userRating: rating,
      },
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Delete movie rating
exports.deleteMovieRating = async (req, res) => {
  try {
    if (!req.user) {
      return ThrowError(res, 401, "User not authenticated");
    }

    const { movieId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(movieId)) {
      return ThrowError(res, 400, "Invalid movie ID");
    }

    const movie = await Movie.findById(movieId);
    if (!movie) {
      return ThrowError(res, 404, "Movie not found");
    }

    // Find user's existing rating
    const existingRatingIndex = movie.ratings.findIndex(
      (r) => r.userId.toString() === userId.toString()
    );

    if (existingRatingIndex === -1) {
      return ThrowError(res, 404, "You have not rated this movie yet");
    }

    // Remove the rating
    movie.ratings.splice(existingRatingIndex, 1);

    // Recalculate average rating
    const totalRatings = movie.ratings.length;
    const sumRatings = movie.ratings.reduce((sum, r) => sum + r.rating, 0);
    movie.rating = totalRatings > 0 ? sumRatings / totalRatings : 0;

    await movie.save();

    return res.status(200).json({
      status: true,
      message: "Rating deleted successfully",
      data: {
        rating: movie.rating,
        totalRatings: totalRatings,
      },
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Get movie rating details
exports.getMovieRatingDetails = async (req, res) => {
  try {
    const { movieId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(movieId)) {
      return ThrowError(res, 400, "Invalid movie ID");
    }

    const movie = await Movie.findById(movieId).populate(
      "ratings.userId",
      "firstName lastName"
    );

    if (!movie) {
      return ThrowError(res, 404, "Movie not found");
    }

    const ratingDetails = {
      averageRating: movie.rating || 0,
      totalRatings: movie.ratings.length,
      ratingDistribution: {
        5: movie.ratings.filter((r) => r.rating === 5).length,
        4: movie.ratings.filter((r) => r.rating === 4).length,
        3: movie.ratings.filter((r) => r.rating === 3).length,
        2: movie.ratings.filter((r) => r.rating === 2).length,
        1: movie.ratings.filter((r) => r.rating === 1).length,
      },
      recentRatings: movie.ratings
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5),
    };

    return res.status(200).json({
      status: true,
      message: "Rating details fetched successfully",
      data: ratingDetails,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Get Top Rated Movies
exports.getTopRatedMovies = async (req, res) => {
  try {
    const user = req.user;
    let baseQuery = {};

    // Apply parental control filter if user is authenticated
    if (user) {
      const userWithParentalControl = await userModel.findById(user._id);
      if (
        userWithParentalControl &&
        userWithParentalControl.parentalControl &&
        userWithParentalControl.parentalControl.length > 0
      ) {
        baseQuery.contentRating = {
          $in: userWithParentalControl.parentalControl,
        };
      }
    }

    let moviesQuery = { ...baseQuery };

    // If authenticated, bias top-rated toward user's dominant genres/categories
    if (user) {
      // Gather user signals
      const populatedUser = await userModel.findById(user._id).populate({
        path: "watchlist",
        populate: { path: "category" },
      });

      const genreCounts = new Map();
      const categoryIds = new Set();

      const incrementGenre = (genreValue) => {
        if (!genreValue) return;
        const genreList = Array.isArray(genreValue)
          ? genreValue
          : String(genreValue)
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean);
        for (const g of genreList) {
          genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
        }
      };

      // Watchlist
      for (const m of populatedUser?.watchlist || []) {
        incrementGenre(m.genre);
        if (m.category && m.category._id)
          categoryIds.add(m.category._id.toString());
      }

      // Watch history
      const WatchHistory = require("../models/watchHistory.model");
      const history = await WatchHistory.find({ userId: user._id }).select(
        "movieId"
      );
      const historyMovieIds = history.map((h) => h.movieId).filter(Boolean);
      if (historyMovieIds.length > 0) {
        const historyMovies = await Movie.find({
          _id: { $in: historyMovieIds },
        }).select("genre category");
        for (const m of historyMovies) {
          incrementGenre(m.genre);
          if (m.category) categoryIds.add(m.category.toString());
        }
      }

      // Continue watching
      const ContinueWatching = require("../models/continueWatching.model");
      const cw = await ContinueWatching.find({ userId: user._id }).select(
        "movieId"
      );
      const cwMovieIds = cw.map((c) => c.movieId).filter(Boolean);
      if (cwMovieIds.length > 0) {
        const cwMovies = await Movie.find({ _id: { $in: cwMovieIds } }).select(
          "genre category"
        );
        for (const m of cwMovies) {
          incrementGenre(m.genre);
          if (m.category) categoryIds.add(m.category.toString());
        }
      }

      const topGenres = Array.from(genreCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([g]) => g);

      if (topGenres.length > 0 || categoryIds.size > 0) {
        moviesQuery.$or = [];
        if (topGenres.length > 0)
          moviesQuery.$or.push({ genre: { $in: topGenres } });
        if (categoryIds.size > 0)
          moviesQuery.$or.push({ category: { $in: Array.from(categoryIds) } });
      }
    }

    // Fetch top-rated movies, biased if we have user signals
    let topRatedMovies = await Movie.find(moviesQuery)
      .sort({ rating: -1, views: -1 })
      .limit(50)
      .populate("category");

    // Fallback to global top-rated if not enough
    if (!topRatedMovies || topRatedMovies.length < 10) {
      const fallback = await Movie.find(baseQuery)
        .sort({ rating: -1, views: -1 })
        .limit(50)
        .populate("category");
      // Merge unique by _id while preserving order
      const existingIds = new Set(topRatedMovies.map((m) => String(m._id)));
      for (const m of fallback) {
        const id = String(m._id);
        if (!existingIds.has(id)) {
          topRatedMovies.push(m);
          existingIds.add(id);
        }
      }
    }

    if (!topRatedMovies || topRatedMovies.length === 0) {
      return ThrowError(res, 404, "No movies found");
    }

    // Fetch seasons and episodes for webseries
    const moviesWithEpisodes = await Promise.all(
      topRatedMovies.map(async (movie) => {
        const movieObj = movie.toObject();
        if (movie.type === "webseries") {
          const episodes = await Episode.find({ movieId: movie._id }).sort({
            seasonNo: 1,
            episodeNo: 1,
          });
          const seasons = new Set(episodes.map((ep) => ep.seasonNo));
          movieObj.totalSeasons = seasons.size;
          movieObj.totalEpisodes = episodes.length;
        } else {
          movieObj.totalSeasons = movieObj.totalSeasons ?? 0;
          movieObj.totalEpisodes = movieObj.totalEpisodes ?? 0;
        }
        return movieObj;
      })
    );

    return res.status(200).json({
      status: true,
      message: "Top rated content fetched successfully",
      data: moviesWithEpisodes,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Get movies user might want to watch again (based on view history)
exports.getWatchAgainMovies = async (req, res) => {
  try {
    if (!req.user) {
      return ThrowError(res, 401, "User not authenticated");
    }

    const userId = req.user._id;

    // Find movies that the user has viewed, and sort them by the latest view timestamp
    const watchAgainMovies = await Movie.aggregate([
      { $match: { "views.userId": userId } },
      { $unwind: "$views" },
      { $match: { "views.userId": userId } }, // Filter unwound views to only include current user's views
      { $sort: { "views.timestamp": -1 } }, // Sort by most recent view by the user
      {
        $group: {
          _id: "$_id",
          title: { $first: "$title" },
          thumbnail: { $first: "$thumbnail" },
          video: { $first: "$video" },
          releaseYear: { $first: "$releaseYear" },
          duration: { $first: "$duration" },
          category: { $first: "$category" },
          languages: { $first: "$languages" },
          description: { $first: "$description" },
          genre: { $first: "$genre" },
          contentDescriptor: { $first: "$contentDescriptor" },
          director: { $first: "$director" },
          long_description: { $first: "$long_description" },
          type: { $first: "$type" },
          rating: { $first: "$rating" },
          lastViewed: { $first: "$views.timestamp" }, // Capture the latest view timestamp for sorting
          isPremium: { $first: "$isPremium" }, // Capture the latest view timestamp for sorting
        },
      },
      { $sort: { lastViewed: -1 } }, // Final sort to ensure most recent overall for the user
      { $limit: 20 }, // Limit to a reasonable number of recommendations
    ]);

    // Populate category manually since aggregation doesn't support populate directly
    await Movie.populate(watchAgainMovies, { path: "category" });

    // Add episode summary for webseries
    const moviesWithEpisodeSummary = await Promise.all(
      watchAgainMovies.map(async (movie) => {
        if (movie.type === "webseries") {
          const episodes = await Episode.find({ movieId: movie._id }).sort({
            seasonNo: 1,
            episodeNo: 1,
          });
          const seasons = new Set(episodes.map((ep) => ep.seasonNo));
          movie.totalSeasons = seasons.size;
          movie.totalEpisodes = episodes.length;
        }
        return movie;
      })
    );

    if (!moviesWithEpisodeSummary || moviesWithEpisodeSummary.length === 0) {
      return res.status(200).json({
        status: true,
        message: "No watch history found or no movies to watch again",
        data: [],
      });
    }

    return res.status(200).json({
      status: true,
      message: "Watch again movies fetched successfully",
      data: moviesWithEpisodeSummary,
    });
  } catch (error) {
    console.error("Error in getWatchAgainMovies:", error);
    return ThrowError(res, 500, error.message);
  }
};

// Get Popular Movies by Category
exports.getPopularMoviesByCategory = async (req, res) => {
  try {
    const user = req.user;
    const { type } = req.query;

    let categoryQuery = {};

    if (user) {
      const userWithParentalControl = await userModel.findById(user._id);

      if (
        userWithParentalControl &&
        Array.isArray(userWithParentalControl.parentalControl) &&
        userWithParentalControl.parentalControl.length > 0
      ) {
        categoryQuery.contentRating = {
          $in: userWithParentalControl.parentalControl,
        };
      }
    }

    const categories = await MovieCategory.find(categoryQuery);

    if (!categories || categories.length === 0) {
      return res.status(200).json({
        status: true,
        message: "No categories found",
        data: {},
      });
    }

    const popularMoviesByCategory = {};

    for (const category of categories) {
      const movieQuery = { category: category._id };

      if (type && ["movie", "webseries"].includes(type)) {
        movieQuery.type = type;
      }

      const movies = await movieModel
        .find(movieQuery).populate("category");

      if (!movies || movies.length === 0) continue;

      movies.sort((a, b) => {
        const viewsA = a.views?.length || 0;
        const viewsB = b.views?.length || 0;
        return b.rating - a.rating || viewsB - viewsA;
      });

      const topMovies = movies.slice(0, 10);

      const moviesWithEpisodes = await Promise.all(
        topMovies.map(async (movie) => {
          if (movie.type === "webseries") {
            const episodes = await Episode.find({ movieId: movie._id }).sort({
              seasonNo: 1,
              episodeNo: 1,
            });

            const seasons = new Set(episodes.map((ep) => ep.seasonNo));
            movie.totalSeasons = seasons.size;
            movie.totalEpisodes = episodes.length;
          } else {
            movie.totalSeasons = 0;
            movie.totalEpisodes = 0;
          }

          return movie;
        })
      );

      popularMoviesByCategory[category.categoryName] = moviesWithEpisodes;
    }

    return res.status(200).json({
      status: true,
      message: `Popular ${type || "all"} content by category fetched successfully`,
      data: popularMoviesByCategory,
    });
  } catch (error) {
    console.error("Error fetching popular movies by category:", error);
    return ThrowError(res, 500, error.message);
  }
};

// Get Movies Grouped By Genre
// exports.getMoviesGroupedByGenre = async (req, res) => {
//   try {
//     const user = req.user;
//     let query = {};

//     // Apply parental control filter if user is authenticated
//     if (user) {
//       // Get user's parental control settings
//       const userWithParentalControl = await userModel.findById(user._id);

//       if (
//         userWithParentalControl &&
//         userWithParentalControl.parentalControl &&
//         userWithParentalControl.parentalControl.length > 0
//       ) {
//         // Filter movies based on user's allowed content ratings
//         query.contentRating = { $in: userWithParentalControl.parentalControl };
//       }
//     }

//     const movies = await Movie.find(query).populate("category");

//     if (!movies || movies.length === 0) {
//       return res.status(200).json({
//         status: true,
//         message: "No movies found",
//         data: {},
//       });
//     }
//     // Group movies by genre, ensuring all genres have the first letter capitalized and ignoring case sensitivity
//     const groupedMovies = movies.reduce((acc, movie) => {
//       let genres = [];
//       if (typeof movie.genre === "string") {
//         genres = movie.genre
//           .split(",")
//           .map(
//             (g) =>
//               g.trim().charAt(0).toUpperCase() + g.trim().slice(1).toLowerCase()
//           )
//           .filter(Boolean);
//       } else if (Array.isArray(movie.genre)) {
//         genres = movie.genre
//           .map(
//             (g) =>
//               g.trim().charAt(0).toUpperCase() + g.trim().slice(1).toLowerCase()
//           )
//           .filter(Boolean);
//       }
//       if (genres.length === 0) {
//         genres = ["Uncategorized"];
//       }

//       genres.forEach((genre) => {
//         if (!genre) return; // Skip if genre is null or undefined

//         // Ensure genre is in the correct case for the accumulator
//         const formattedGenre =
//           genre.charAt(0).toUpperCase() + genre.slice(1).toLowerCase();
//         if (!acc[formattedGenre]) {
//           acc[formattedGenre] = [];
//         }
//         acc[formattedGenre].push({
//           _id: movie._id,
//           title: movie.title,
//           thumbnail: movie.thumbnail,
//           description: movie.description,
//           type: movie.type,
//           views: movie.views || [],
//           rating: movie.rating || 0,
//           category: movie.category,
//         });
//       });
//       return acc;
//     }, {});

//     // Sort movies within each genre by rating and views
//     Object.keys(groupedMovies).forEach((genre) => {
//       groupedMovies[genre].sort((a, b) => {
//         const ratingDiff = (b.rating || 0) - (a.rating || 0);
//         if (ratingDiff !== 0) return ratingDiff;
//         return (b.views || 0) - (a.views || 0);
//       });
//     });

//     // Add episode summary for webseries
//     const groupedMoviesWithEpisodeSummary = {};
//     for (const genre in groupedMovies) {
//       groupedMoviesWithEpisodeSummary[genre] = await Promise.all(
//         groupedMovies[genre].map(async (movie) => {
//           if (movie.type === "webseries") {
//             const episodes = await Episode.find({ movieId: movie._id }).sort({
//               seasonNo: 1,
//               episodeNo: 1,
//             });
//             const seasons = new Set(episodes.map((ep) => ep.seasonNo));
//             movie.totalSeasons = seasons.size;
//             movie.totalEpisodes = episodes.length;
//           }
//           return movie;
//         })
//       );
//     }

//     return res.status(200).json({
//       status: true,
//       message: "Movies grouped by genre fetched successfully",
//       data: groupedMoviesWithEpisodeSummary,
//     });
//   } catch (error) {
//     return ThrowError(res, 500, error.message);
//   }
// };

// Get Last 5 Uploaded Movies
exports.getLastFiveUploadedMovies = async (req, res) => {
  try {
    const user = req.user;
    let query = {};

    // Apply parental control filter if user is authenticated
    if (user) {
      // Get user's parental control settings
      const userWithParentalControl = await userModel.findById(user._id);

      if (
        userWithParentalControl &&
        userWithParentalControl.parentalControl &&
        userWithParentalControl.parentalControl.length > 0
      ) {
        // Filter movies based on user's allowed content ratings
        query.contentRating = { $in: userWithParentalControl.parentalControl };
      }
    }
    const movies = await Movie.find(query)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("category");
    if (!movies || movies.length === 0) {
      return res.status(200).json({
        status: true,
        message: "No movies found",
        data: [],
      });
    }

    // Add episode summary for webseries
    const moviesWithEpisodeSummary = await Promise.all(
      movies.map(async (movie) => {
        const movieObj = movie.toObject();
        if (movie.type === "webseries") {
          const episodes = await Episode.find({ movieId: movie._id }).sort({
            seasonNo: 1,
            episodeNo: 1,
          });
          const seasons = new Set(episodes.map((ep) => ep.seasonNo));
          movieObj.totalSeasons = seasons.size;
          movieObj.totalEpisodes = episodes.length;
        }
        return movieObj;
      })
    );

    return res.status(200).json({
      status: true,
      message: "Last 5 uploaded movies fetched successfully",
      data: moviesWithEpisodeSummary,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};



exports.addView = async (req, res) => {
  try {
    const { movieId } = req.params;
    const userId = req.user._id; // assuming user is authenticated and userId is in req.user

    const movie = await Movie.findById(movieId);
    if (movie) {
      const existingViewIndex = movie.views.findIndex(
        (view) => view.userId.toString() === userId.toString()
      );
      if (existingViewIndex !== -1) {
        movie.views[existingViewIndex].timestamp = new Date();
        await movie.save();
      } else {
        movie.views.push({ userId, timestamp: new Date() });
        await movie.save();
      }
    }

    if (!movie) {
      return res.status(404).json({ message: "Movie not found" });
    }

    res.json({ message: "View added", viewsCount: movie.views.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

//movie.controller.js
exports.mediaFilter = async (req, res) => {
  try {
    const { categoryId } = req?.params;
    const { q } = req?.query;

    let filter = { category: categoryId };

    if (q === "movies") {
      filter.type = "movie";
    } else if (q === "webseries") {
      filter.type = "webseries";
    }
    // if q === "all" or undefined, we just filter by category

    const record = await movieModel.find(filter);

    let message = "All Movies & Series fetched by this category ID";
    if (q === "movies") {
      message = "All Movies fetched by this category ID";
    } else if (q === "webseries") {
      message = "All Web Series fetched by this category ID";
    }

    return res.status(200).json({
      message: message,
      result: record
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Error during media filter",
      error: error.message
    });
  }
}

//movie/ banner
exports.getCarouselController = async (req, res) => {
  try {
    const user = req.user;
    // let matchQuery = { type: "movie" }; // filter only movies

    // Apply parental control filter if user is authenticated
    if (user) {
      const userWithParentalControl = await userModel.findById(user._id);

      if (
        userWithParentalControl &&
        userWithParentalControl.parentalControl &&
        userWithParentalControl.parentalControl.length > 0
      ) {
        matchQuery.contentRating = {
          $in: userWithParentalControl.parentalControl,
        };
      }
    }

    const movies = await movieModel.find({ type: "movie" }).sort({ createdAt: -1 }).limit(5)

    return res.status(200).json({
      status: true,
      message: "last 5 movies carousel for fetched successfully",
      data: movies,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

exports.getMostWatchedMovies = async (req, res) => {
  try {
    const movies = await movieModel.find({ type: "movie" });

    const sortedMovies = movies
      .map(movie => ({
        ...movie._doc,
        viewCount: movie.views?.length || 0
      }))
      .sort((a, b) => b.viewCount - a.viewCount);

    const topMovies = sortedMovies.slice(0, 5);

    return res.status(200).json({
      status: true,
      message: "Top most viewed movies fetched successfully",
      data: topMovies
    });


  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Error during getMostWatchedMovies ",
      error: error.message
    })
  }
}

exports.getWebSeriesCarouselBannerController = async (req, res) => {
  try {
    const user = req.user;
    let matchQuery = { type: "webseries" };

    // Apply parental control filter if user is authenticated
    if (user) {
      const userWithParentalControl = await userModel.findById(user._id);

      if (
        userWithParentalControl &&
        userWithParentalControl.parentalControl &&
        userWithParentalControl.parentalControl.length > 0
      ) {
        matchQuery.contentRating = {
          $in: userWithParentalControl.parentalControl,
        };
      }
    }

    // Get last 5 webseries
    const webseries = await movieModel
      .find(matchQuery)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("category");

    // Add seasons & episode count
    const webseriesWithSeasons = await Promise.all(
      webseries.map(async (series) => {
        const seriesObj = series.toObject();

        const episodes = await Episode.find({ movieId: series._id }).sort({
          seasonNo: 1,
          episodeNo: 1,
        });

        const seasons = new Set(episodes.map((ep) => ep.seasonNo));

        seriesObj.totalSeasons = seasons.size;
        seriesObj.totalEpisodes = episodes.length;

        return seriesObj;
      })
    );

    return res.status(200).json({
      status: true,
      message: "Last 5 Webseries carousel fetched successfully",
      data: webseriesWithSeasons,
    });

  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

exports.getMostWatchedWebSeries = async (req, res) => {
  try {
    const movies = await movieModel.find({ type: "webseries" });

    const sortedMovies = movies
      .map(movie => ({
        ...movie._doc,
        viewCount: movie.views?.length || 0
      }))
      .sort((a, b) => b.viewCount - a.viewCount);

    const topMovies = sortedMovies.slice(0, 5);

    return res.status(200).json({
      status: true,
      message: "Top most viewed web series fetched successfully",
      data: topMovies
    });


  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Error during getMostWatchedMovies ",
      error: error.message
    })
  }
}


exports.getTopWebseriesThisWeek = async (req, res) => {
  try {
    const user = req.user;
    let query = { type: "webseries" };

    // Apply parental control filter if user is authenticated
    if (user) {
      const userWithParentalControl = await userModel.findById(user._id);

      if (
        userWithParentalControl &&
        userWithParentalControl.parentalControl &&
        userWithParentalControl.parentalControl.length > 0
      ) {
        query.contentRating = { $in: userWithParentalControl.parentalControl };
      }
    }

    const topWebseries = await Movie.find(query)
      .sort({ views: -1 })
      .limit(10)
      .populate("category");

    const webseriesWithEpisodes = await Promise.all(
      topWebseries.map(async (series) => {
        const seriesObj = series.toObject();
        const episodes = await Episode.find({ movieId: series._id }).sort({
          seasonNo: 1,
          episodeNo: 1,
        });
        const seasons = new Set(episodes.map((ep) => ep.seasonNo));
        seriesObj.totalSeasons = seasons.size;
        seriesObj.totalEpisodes = episodes.length;
        return seriesObj;
      })
    );

    return res.status(200).json({
      status: true,
      message: "Top webseries this week fetched successfully",
      data: webseriesWithEpisodes,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};


exports.AllSearchController = async (req, res) => {
  try {
    const { search } = req.query;
    const userId = req.user?._id;

    if (!search || search.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Search query parameter is required."
      });
    }

    // Save recent search
    const recentSearch = await recentSearchModel.create({ userId, search });
    await recentSearch.save();
    // Get movies matching title
    const movies = await Movie.find({
      title: { $regex: search, $options: "i" }
    }).limit(20);

    if (!movies || movies.length === 0) {
      return res.status(200).json({
        success: false,
        results: [],
        message: "No movies found for the search query."
      });
    }

    return res.status(200).json({
      success: true,
      results: movies,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error while searching for movies.",
      error: error.message
    });
  }
};

exports.getRecentSearch = async (req, res) => {
  try {
    const userId = req.user?._id;
    const recentSearch = await recentSearchModel.find({ userId }).sort({ createdAt: -1 }).limit(10);
    return res.status(200).json({
      status: true,
      message: "Recent search fetched successfully",
      data: recentSearch,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
}

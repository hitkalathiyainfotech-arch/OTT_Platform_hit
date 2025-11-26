const express = require("express");
const indexRoutes = express.Router();
const { removeUser, pdateUser, getUserById, getAllUsers, createNewUser, resetPassword, verifyOtp, sendDeleteOtp, verifyDeleteOtp, getDevices, removeDevice, logoutDevice, enableTwoStep, verifyTwoStep, updateScreenTimeUsage, getScreenTimeRemaining, updateUser, } = require("../controller/user.controller");
const { userLogin, googleLogin, forgotPassword, changePassword, userLogout, sendOtpToMobile, facebookLogin, generateNewToken, verifyTwoStepOTP, } = require("../auth/auth");
const { auth, movieAuth } = require("../middleware/auth");
const { getTrending, getPopularSeries, getAllMovies, getMovieById, deleteMovie, getPopularMovies, getTopMoviesThisWeek, getRecommendedContent, getTop10Content, rateMovie, updateMovieRating, deleteMovieRating, getMovieRatingDetails, getTopRatedMovies, incrementMovieViews, getWatchAgainMovies, getPopularMoviesByCategory, createMovie, updateMovie, getTrendingSeries, getTrendingMovie, getMoviesGroupedByGenre, getLastFiveUploadedMovies, addView, uploadVideo, mediaFilter, getCarouselController, AllSearchController, getTopWebseriesThisWeek, getWebSeriesCarouselBannerController, getAllTrending, getRecentSearch, getMostWatchedMovies, getMostWatchedWebSeries, } = require("../controller/movie.controller.js");
const { createCategory, updateCategory, getCategoryById, getAllCategories, deleteCategory, } = require("../controller/movieCategory.Controller");
const { upload, convertJfifToJpeg } = require("../helper/uplodes");
const { createStarring, getAllStarring, getStarringById, getStarringByMovieId, updateStarring, deleteStarring, } = require("../controller/starring.controller");
const { createEpisode, getAllEpisodes, getEpisodeById, updateEpisode, deleteEpisode, uploadEpisode, } = require("../controller/episode.Controller");
const { createContactUs, getContactUsById, getAllContactUs, updateContactUs, deleteContactUs, } = require("../controller/contactUs.Controller");
const { createTermsCondition, getTermsConditionById, getAllTermsCondition, updateTermsCondition, deleteTermsCondition, } = require("../controller/TermConditions.controller");
const { createprivacyPolicy, getprivacyPolicyById, getAllprivacyPolicy, updateprivacyPolicy, deleteprivacyPolicy, } = require("../controller/PrivacyPolicy.controller");
const { createCookiePolicy, getCookiePolicyById, getAllCookiePolicy, updateCookiePolicy, deleteCookiePolicy, } = require("../controller/CookiePolicy.controller");
const { createFaq, getAllFaqs, getFaqById, updateFaq, deleteFaq, } = require("../controller/faq.controller");
const { addToWatchlist, removeFromWatchlist, getWatchlist, } = require("../controller/watchlistController");
const { createSubscribe, getSubscribeById, getAllSubscribe, updateSubscribe, deleteSubscribe, } = require("../controller/subscribe.controller");
const { dashboard, topCategories, totalRevenue, newSubscribersByPlan, mostWatched, } = require("../controller/dashboard.controller");
const { addOrUpdateContinueWatching, getContinueWatching, removeContinueWatching, } = require("../controller/continueWatching.controller");
const { createPremium, getallPremium, updatePremium, deletePremium, updateFeatureDescription, getPremiumById, } = require("../controller/premium.controller");
const { getAllFeature, createFeature, } = require("../controller/Feature.controller");
const { createPayment, getallPayment, getPaymentUser, } = require("../controller/payment.controller");
const { getAds, createAds, updateAds, deleteAds, getallAds, } = require("../controller/ads.controller");
const csrf = require("csurf");
const { cacheMiddleware } = require("../middleware/cache");

const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
  },
});

// CSRF token endpoint (exclude from CSRF protection)
indexRoutes.get("/csrf-token", csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

indexRoutes.get("/health/redis", async (req, res) => {
  try {
    const ready = !!(global.redisClient && global.redisClient.isReady);
    if (!ready) return res.status(200).json({ ready: false });
    try {
      const pong = await global.redisClient.ping();
      return res.status(200).json({ ready: true, ping: pong });
    } catch {
      return res.status(200).json({ ready: true });
    }
  } catch (e) {
    return res.status(500).json({ ready: false, error: e.message });
  }
});

// Apply CSRF protection to all routes except GET requests and specific endpoints
indexRoutes.use((req, res, next) => {
  // Skip CSRF for GET requests and specific endpoints
  if (
    req.method === "GET" ||
    req.path === "/csrf-token" ||
    req.path.startsWith("/uploads/") ||
    req.path.startsWith("/userLogin") ||
    req.path.startsWith("/google-login") ||
    req.path.startsWith("/facebook-login") ||
    req.path.startsWith("/register") ||
    req.path.startsWith("/logout") ||
    req.path.startsWith("/createUser") ||
    req.path.startsWith("/verifyOtp") ||
    req.path.startsWith("/forgotPassword") ||
    req.path.startsWith("/generateNewTokens") ||
    req.path.startsWith("/changePassword") ||
    req.path.startsWith("/createMovie") ||
    req.path.startsWith("/addview")
  ) {
    return next();
  }
  // Apply CSRF protection for other requests
  return csrfProtection(req, res, next);
});

// CSRF error handler
indexRoutes.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    console.error("CSRF token validation failed for:", req.path, req.method);
    return res.status(403).json({
      success: false,
      message: "CSRF token validation failed",
      error: "Invalid CSRF token",
      timestamp: new Date().toISOString(),
    });
  }
  next(err);
});


// auth Routes
indexRoutes.post("/userLogin", userLogin);
indexRoutes.post("/logout/:id", userLogout);
indexRoutes.post("/google-login", googleLogin);
indexRoutes.post("/facebook-login", facebookLogin);
indexRoutes.post("/forgotPassword", forgotPassword);
indexRoutes.post("/changePassword", changePassword);
indexRoutes.post("/otp", sendOtpToMobile);
indexRoutes.post("/verify-two-step", verifyTwoStepOTP);

indexRoutes.post("/generateNewTokens", generateNewToken);

// user Routes

indexRoutes.post("/createUser", createNewUser);
indexRoutes.get("/allUsers", getAllUsers);
indexRoutes.post("/verifyOtp", verifyOtp);
indexRoutes.get("/getUserById/:id", getUserById);
indexRoutes.put("/userUpdate/:id", upload.single("photo"), csrfProtection, updateUser);
indexRoutes.delete("/deleteUser/:id", csrfProtection, removeUser);
indexRoutes.put("/resetPassword", csrfProtection, resetPassword);
indexRoutes.post("/sendDeleteOtp", csrfProtection, sendDeleteOtp);
indexRoutes.post("/verifyDeleteOtp", csrfProtection, verifyDeleteOtp);
indexRoutes.post("/enableTwoStep", csrfProtection, enableTwoStep);
indexRoutes.post("/verifyTwoStep", csrfProtection, verifyTwoStep);
indexRoutes.post("/screenTimeUsage/:id", csrfProtection, movieAuth, updateScreenTimeUsage);
indexRoutes.get("/screenTimeRemaining/:id", movieAuth, getScreenTimeRemaining);

//movies Category Routes

indexRoutes.post("/createCategory", csrfProtection, upload.single("category_image"), convertJfifToJpeg, createCategory);
indexRoutes.get("/getCategoryById/:id", cacheMiddleware((req) => `cache:GET:${req.originalUrl}`, 3600), getCategoryById);
indexRoutes.get("/getAllCategories", cacheMiddleware((req) => `cache:GET:${req.originalUrl}`, 3600), getAllCategories);
indexRoutes.put("/updateCategory/:id", csrfProtection, upload.single("category_image"), convertJfifToJpeg, updateCategory);
indexRoutes.delete("/deleteCategory/:id", csrfProtection, deleteCategory);

indexRoutes.get("/movie/carousel/banner", getCarouselController);
indexRoutes.get("/getMostWatchedMovies", getMostWatchedMovies);
indexRoutes.get("/webseries/carousel/banner", getWebSeriesCarouselBannerController)
indexRoutes.get("/getMostWatchedWebSeries", getMostWatchedWebSeries);
// movie Routes

indexRoutes.get("/trending", movieAuth, getTrending);
indexRoutes.get("/popularSeries", movieAuth, getPopularSeries);
indexRoutes.get("/getTop10Content", movieAuth, getTop10Content);
indexRoutes.get("/getTopRatedMovie", movieAuth, getTopRatedMovies);
indexRoutes.get("/getLastFiveUploadedMovies", movieAuth, getLastFiveUploadedMovies);

indexRoutes.get("/media/filter/:categoryId", movieAuth, mediaFilter);
indexRoutes.get("/search", movieAuth, AllSearchController);
//recent search
indexRoutes.get("/recentSearch", movieAuth, getRecentSearch);

indexRoutes.post("/createMovie", csrfProtection,
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "poster", maxCount: 1 },
    { name: "nameImage", maxCount: 1 },
    { name: "video", maxCount: 1 },
    { name: "starring_image", maxCount: 10 },
    { name: "trailer", maxCount: 1 }
  ]), createMovie
);

// actors starring routes

indexRoutes.post("/createStarring", csrfProtection, upload.single("starring_image"), convertJfifToJpeg, createStarring);
indexRoutes.get("/getAllStarring", getAllStarring);
indexRoutes.get("/getStarringById/:id", getStarringById);
indexRoutes.get("/getStarringByMovieId/:movieId", getStarringByMovieId);
indexRoutes.put("/updateStarring/:id", csrfProtection, upload.single("starring_image"), convertJfifToJpeg, updateStarring);
indexRoutes.delete("/deleteStarring/:id", csrfProtection, deleteStarring);
// Get movie by ID
indexRoutes.get("/getMovieById/:id", getMovieById);

// Update movie
indexRoutes.put("/updateMovie/:id", csrfProtection, auth,
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "poster", maxCount: 1 },
    { name: "nameImage", maxCount: 1 },
    { name: "video", maxCount: 1 },
    { name: "starring_image", maxCount: 10 },
    { name: "trailer", maxCount: 1 }
  ]),
  updateMovie
);

indexRoutes.post("/movies/:movieId/upload-video", csrfProtection, auth, upload.fields([{ name: "video", maxCount: 1 }]), uploadVideo);
// Delete movie
indexRoutes.delete("/deleteMovie/:id", csrfProtection, auth, deleteMovie);

// Get all movies
indexRoutes.get("/getAllMovies", movieAuth, getAllMovies);

// New routes for movie listings
indexRoutes.get("/allTranding", movieAuth, getAllTrending)
indexRoutes.get("/trendingSeries", movieAuth, getTrendingSeries);
indexRoutes.get("/trendingMovies", movieAuth, getTrendingMovie);
indexRoutes.get("/getPopularMovies", movieAuth, getPopularMovies);
indexRoutes.get("/MoviesGroupedByGenre", movieAuth, getMoviesGroupedByGenre);
indexRoutes.get("/getTopMoviesThisWeek", movieAuth, getTopMoviesThisWeek);
indexRoutes.get("/getTopWebseriesThisWeek", getTopWebseriesThisWeek);
indexRoutes.get("/getRecommendedContent", auth, getRecommendedContent);
indexRoutes.get("/getTop10Content", movieAuth, getTop10Content);
indexRoutes.post("/rateMovie/:movieId", auth, rateMovie);
indexRoutes.put("/updateMovieRating/:movieId", auth, updateMovieRating);
indexRoutes.delete("/deleteMovieRating/:movieId", auth, deleteMovieRating);
indexRoutes.get("/getMovieRatingDetails/:movieId", getMovieRatingDetails);
indexRoutes.get("/getTopRatedMovie", movieAuth, getTopRatedMovies);
indexRoutes.get("/getWatchAgainMovies", auth, getWatchAgainMovies);

indexRoutes.post("/addview/:movieId", auth, addView);
// Get popular movies by category
indexRoutes.get("/getPopularMoviesByCategory", movieAuth, getPopularMoviesByCategory);

//get webserie s by genere

//episode
indexRoutes.post("/createEpisode", csrfProtection, upload.fields([{ name: "thumbnail", maxCount: 1 }]), createEpisode);
indexRoutes.get("/getAllEpisodes", getAllEpisodes);
indexRoutes.get("/getEpisodeById/:id", getEpisodeById);
indexRoutes.put("/updateEpisode/:id", csrfProtection, upload.fields([{ name: "thumbnail", maxCount: 1 }]), updateEpisode);
indexRoutes.delete("/deleteEpisode/:id", csrfProtection, deleteEpisode);

indexRoutes.post("/episode/:episodeId/upload-video", csrfProtection, auth, upload.fields([{ name: "video", maxCount: 1 }]), uploadEpisode);

// contactUs

indexRoutes.post("/createContactUs", csrfProtection, createContactUs);
indexRoutes.get("/getContactUsById/:id", getContactUsById);
indexRoutes.get("/getAllContactUs", getAllContactUs);
indexRoutes.put("/updateContactUs/:id", csrfProtection, updateContactUs);
indexRoutes.delete("/deleteContactUs/:id", csrfProtection, deleteContactUs);

// Term Condition

indexRoutes.post("/createTermsCondition", csrfProtection, createTermsCondition);
indexRoutes.get("/getTermsConditionById/:id", cacheMiddleware((req) => `cache:GET:${req.originalUrl}`, 3600), getTermsConditionById);
indexRoutes.get("/getAllTermsCondition", cacheMiddleware((req) => `cache:GET:${req.originalUrl}`, 3600), getAllTermsCondition);
indexRoutes.put("/updateTermsCondition/:id", csrfProtection, updateTermsCondition);
indexRoutes.delete("/deleteTermsCondition/:id", csrfProtection, deleteTermsCondition);

// privacyPolicy

indexRoutes.post("/createprivacyPolicy", csrfProtection, createprivacyPolicy);
indexRoutes.get("/getprivacyPolicyById/:id", cacheMiddleware((req) => `cache:GET:${req.originalUrl}`, 3600), getprivacyPolicyById);
indexRoutes.get("/getAllprivacyPolicy", cacheMiddleware((req) => `cache:GET:${req.originalUrl}`, 3600), getAllprivacyPolicy);
indexRoutes.put("/updateprivacyPolicy/:id", csrfProtection, updateprivacyPolicy);
indexRoutes.delete("/deleteprivacyPolicy/:id", csrfProtection, deleteprivacyPolicy);

// cookiePolicy

indexRoutes.post("/createcookiePolicy", csrfProtection, createCookiePolicy);
indexRoutes.get("/getcookiePolicyById/:id", cacheMiddleware((req) => `cache:GET:${req.originalUrl}`, 3600), getCookiePolicyById);
indexRoutes.get("/getAllcookiePolicy", cacheMiddleware((req) => `cache:GET:${req.originalUrl}`, 3600), getAllCookiePolicy);
indexRoutes.put("/updatecookiePolicy/:id", csrfProtection, updateCookiePolicy);
indexRoutes.delete("/deletecookiePolicy/:id", csrfProtection, deleteCookiePolicy);

// subscribe
indexRoutes.post("/createsubscribe", csrfProtection, createSubscribe);
indexRoutes.get("/getsubscribeById/:id", getSubscribeById);
indexRoutes.get("/getAllsubscribe", getAllSubscribe);
indexRoutes.put("/updatesubscribe", csrfProtection, updateSubscribe);
indexRoutes.delete("/deletesubscribe/:id", csrfProtection, deleteSubscribe);

// FAQ Routes
indexRoutes.post("/createFaq", csrfProtection, createFaq);
indexRoutes.get("/getAllFaqs", cacheMiddleware((req) => `cache:GET:${req.originalUrl}`, 3600), getAllFaqs);
indexRoutes.get("/getFaqById/:id", cacheMiddleware((req) => `cache:GET:${req.originalUrl}`, 3600), getFaqById);
indexRoutes.put("/updateFaq/:id", csrfProtection, updateFaq);
indexRoutes.delete("/deleteFaq/:id", csrfProtection, deleteFaq);

// watchList
indexRoutes.post("/addToWatchlist", csrfProtection, auth, addToWatchlist);
indexRoutes.post("/removeFromWatchlist", csrfProtection, auth, removeFromWatchlist);
indexRoutes.get("/getWatchlist", auth, getWatchlist);

// Dashboard
indexRoutes.get("/dashboard", dashboard);
indexRoutes.get("/topCategories", topCategories);
indexRoutes.get("/totalRevenue", totalRevenue);
indexRoutes.get("/newSubscribersByPlan", newSubscribersByPlan);
indexRoutes.get("/mostWatched", mostWatched);

// continueWatchlist History
indexRoutes.post("/continue-watching", csrfProtection, auth, addOrUpdateContinueWatching);
indexRoutes.get("/getcontinue-watching", auth, getContinueWatching);
indexRoutes.delete("/remove-continue-watching/:id", csrfProtection, auth, removeContinueWatching);

// Premium
indexRoutes.post("/createPremium", csrfProtection, createPremium);
indexRoutes.get("/getallPremium", cacheMiddleware((req) => `cache:GET:${req.originalUrl}`, 3600), getallPremium);
indexRoutes.put("/updatePremium/:id", csrfProtection, updatePremium);
indexRoutes.delete("/deletePremium/:id", csrfProtection, deletePremium);
indexRoutes.get("/getPremiumById/:id", getPremiumById)
indexRoutes.put("/premium/feature-description/:id", csrfProtection, updateFeatureDescription);

// payment
indexRoutes.post("/create-payment", csrfProtection, auth, createPayment);
indexRoutes.get("/getpayment", getallPayment);
indexRoutes.get("/getPaymentUser", auth, getPaymentUser);

// Feature
indexRoutes.get("/getallfeature", cacheMiddleware((req) => `cache:GET:${req.originalUrl}`, 3600), getAllFeature);
indexRoutes.post("/createfeature", csrfProtection, createFeature);

// Ads
indexRoutes.get("/ads", auth, getAds);
indexRoutes.get("/getallads", cacheMiddleware((req) => `cache:GET:${req.originalUrl}`, 3600), getallAds);
indexRoutes.post("/createads", csrfProtection, upload.fields([{ name: "video", maxCount: 1 }]), createAds);
indexRoutes.put("/updateads/:id", csrfProtection, upload.fields([{ name: "video", maxCount: 1 }]), updateAds);
indexRoutes.delete("/deleteads/:id", csrfProtection, deleteAds);

// Device management routes
indexRoutes.get("/devices", auth, getDevices);
indexRoutes.post("/logout-device", csrfProtection, auth, logoutDevice);

module.exports = indexRoutes;

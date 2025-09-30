const xss = require("xss");

function sanitize(input) {
    if (!input) return "";
  
    // Convert to string if not already
    const str = String(input);
  
    // Remove any HTML tags and sanitize, then replace invalid file path characters
    return xss(str.trim()).replace(/[<>:"/\\|?*\n\r\t]+/g, "_");
  }

function formatMovieObject(movie) {
  if (!movie) return null;

  const formattedMovie = {
    thumbnail: {
      url: movie.thumbnail && movie.thumbnail.url ? movie.thumbnail.url : null
    },
    poster: {
      url: movie.poster && movie.poster.url ? movie.poster.url : null
    },
    nameImage: {
      url: movie.nameImage && movie.nameImage.url ? movie.nameImage.url : null
    },
    trailer: {
      url: movie.trailer && movie.trailer.url ? movie.trailer.url : null
    },
    _id: movie._id,
    title: movie.title,
    releaseYear: movie.releaseYear,
    duration: movie.duration,
    category: {
        _id:movie.category._id,
        categoryName:movie.category.categoryName
    },
    languages: movie.languages,
    description: movie.description,
    genre: movie.genre,
    type: movie.type,
    rating: movie.rating,
    isPremium: movie.isPremium,
    contentRating: movie.contentRating,
    formattedDuration: movie.formattedDuration,
    id: movie.id
  };

  if (movie.type === "webseries") {
    formattedMovie.totalSeasons = movie.totalSeasons;
    formattedMovie.totalEpisodes = movie.totalEpisodes;
  }

  return formattedMovie;
}

module.exports = {
  sanitize,
  formatMovieObject,
};

function ThrowError(response, statusCode, msg) {
  return response.status(statusCode || 500).json({
    msg: msg || "Internal Server Error",
    data: null,
  });
}
module.exports = {ThrowError};

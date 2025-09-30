const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const folderName = file.fieldname;
    const uploadPath = path.join("uploads", folderName);

    fs.mkdir(uploadPath, { recursive: true }, function (err) {
      if (err) {
        return cb(err);
      }
      cb(null, uploadPath);
    });
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname.replaceAll(" ", "")}`);
  },
});

// const fileFilter = (req, file, cb) => {
//   const allowedTypes = "*/*";
//   if (true) {
//     cb(null, true);
//   } else {
//     cb(new Error("Invalid file type"), false);
//   }

//   // if (allowedTypes.includes(file.mimetype)) {
//   //   cb(null, true);
//   // } else {
//   //   cb(new Error("Invalid file type"), false);
//   // }
// };

const upload = multer({
  storage: storage,
  // fileFilter: fileFilter,
});

const convertJfifToJpeg = async (req, res, next) => {
  try {
    const file =
      req.file || (req.files && req.files["image"] && req.files["image"][0]);
    if (!file) return next();

    // Only process image files
    if (file.fieldname === "thumbnail" || file.fieldname === "image") {
      const ext = path.extname(file.originalname).toLowerCase();

      if (
        ext === ".jfif" ||
        file.mimetype === "image/jfif" ||
        file.mimetype === "application/octet-stream"
      ) {
        console.warn(
          "JFIF to JPEG conversion is currently designed for local files and might not work as expected with direct S3 uploads. Consider client-side conversion or a different server-side approach."
        );
      }
    }

    next();
  } catch (err) {
    console.error("Error in convertJfifToJpeg:", err);
    next(err);
  }
};

module.exports = {
  upload,
  convertJfifToJpeg,
};

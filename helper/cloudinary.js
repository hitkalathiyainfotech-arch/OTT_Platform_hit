const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const fsExtra = require("fs-extra");
const path = require("path");
// const AWS = require('aws-sdk');
const { S3, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { emitProgressToUser } = require("../helper/socketManager");
const sharp = require("sharp");

const s3 = new S3({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const contentTypeMap = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".vtt": "text/vtt",
};

const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypeMap = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".m3u8": "application/vnd.apple.mpegurl",
    ".ts": "video/mp2t",
    ".vtt": "text/vtt",
  };
  return contentTypeMap[ext] || "application/octet-stream";
};

const isImageExt = (ext) =>
  [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext);

/**
 * Upload a file to S3. If image, convert to WebP (same dimensions) before uploading.
 * - Converts to WebP with tuned quality to reduce size while keeping visual quality.
 * - Sets correct Content-Type (image/webp) and uses .webp key.
 * - Always removes the local original file after attempting upload.
 */
const fileupload = async (filePath, folderName, onProgress) => {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath, ext);

  let uploadBody;
  let contentType;
  let key;

  try {
    if (isImageExt(ext)) {
      // Convert to webp in-memory; keep same pixel dimensions; optimize quality/effort
      const image = sharp(filePath);
      const metadata = await image.metadata();

      const isPngLike =
        ext === ".png" ||
        (metadata.hasAlpha && (ext === ".gif" || ext === ".webp"));

        const webpOptions = isPngLike
        ? {
            quality: 80,       
            alphaQuality: 90,  
            effort: 6         
          }
        : {
            quality: 75,      
            alphaQuality: 90,   
            effort: 6 
          };

      uploadBody = await image.webp(webpOptions).toBuffer();
      contentType = "image/webp";
      key = `${folderName}/${base}.webp`;
    } else {
      // Non-image: upload as-is
      uploadBody = fs.readFileSync(filePath);
      contentType = getContentType(filePath);
      key = `${folderName}/${path.basename(filePath)}`;
    }

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: uploadBody,
      ContentType: contentType,
      ACL: "public-read",
      CacheControl: "public, max-age=31536000, immutable",
    };

    await s3.putObject(uploadParams);

    return {
      Location: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uploadParams.Key}`,
      ETag: uploadParams.Key,
      url: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uploadParams.Key}`,
      public_id: uploadParams.Key,
    };
  } catch (error) {
    throw error;
  } finally {
    // Remove local original file regardless of success/failure
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      // ignore unlink errors
    }
  }
};

const uploadHLSFolder = async (folderPath, s3Folder, movieTitle, userId) => {
  const files = fsExtra.readdirSync(folderPath);
  const uploadResults = [];
  const totalFiles = files.filter(
    (file) =>
      file.endsWith(".m3u8") || file.endsWith(".ts") || file.endsWith(".vtt")
  ).length;
  let uploadedCount = 0;

  const s3BaseFolder = `${s3Folder}/${movieTitle}`;

  for (const file of files) {
    const filePath = path.join(folderPath, file);

    const ext = path.extname(file).toLowerCase();
    const contentType = contentTypeMap[ext] || "application/octet-stream";

    if (
      !file.endsWith(".m3u8") &&
      !file.endsWith(".ts") &&
      !file.endsWith(".vtt")
    )
      continue;

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `${s3BaseFolder}/${file}`,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
      ACL: "public-read",
      CacheControl: "public, max-age=31536000, immutable",
    };

    const upload = new Upload({
      client: s3,
      params: uploadParams,
    });

    upload.on("httpUploadProgress", (progress) => {
      const percentage = Math.round((progress.loaded / progress.total) * 100);
      emitProgressToUser(userId, {
        status: "uploading",
        message: `Uploading ${file}...`,
        progress: uploadedCount * (100 / totalFiles) + percentage / totalFiles,
        movieTitle,
        process: "Uploading",
      });
    });

    const res = await upload.done();
    uploadedCount++;
    emitProgressToUser(userId, {
      status: "uploaded",
      message: `Finished uploading ${file}.`,
      progress: uploadedCount * (100 / totalFiles),
      movieTitle,
      process: "Uploading",
    });

    uploadResults.push({
      name: file,
      url: res.Location,
      key: s3BaseFolder, // whale folder key (the folder, not the file)
    });

    fs.unlinkSync(filePath);
  }
  const master = uploadResults.find((f) => f.name.includes("master.m3u8"));
  return {
    masterUrl: master ? master.url : null,
    files: uploadResults,
    key: s3BaseFolder,
    public_id: s3BaseFolder,
  };
};

const deleteFile = async (public_id) => {
  try {
    const deleteParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: public_id, // public_id should be the S3 object key (e.g., "CategoryImage/1754539790040-AdvancedPhotoshop-ActionGamingPoster.jpg")
    };
    if (typeof s3.send === "function") {
      const result = await s3.send(new DeleteObjectCommand(deleteParams));
      return result;
    } else if (typeof s3.deleteObject === "function") {
      const result = await s3.deleteObject(deleteParams).promise();
      return result;
    } else {
      throw new Error("Unsupported S3 client: cannot delete object");
    }
  } catch (error) {
    console.error("Error deleting file from S3:", error);
    throw error;
  }
};

module.exports = {
  fileupload,
  deleteFile,
  uploadHLSFolder,
};

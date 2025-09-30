const Ads = require("../models/ads.model");
const { ThrowError } = require("../utils/ErrorUtils");
const { decryptData } = require("../utils/encryption.js");
const { fileupload } = require("../helper/cloudinary");
const fs = require("fs");
const User = require("../models/user.model");
const { invalidateCache } = require("../middleware/cache");

// Get all active ads
exports.getAds = async (req, res) => {
  try {
    // Get user from request (assuming auth middleware is used)
    const userId = req.user?._id;

    if (!userId) {
      // If no user, return all active ads
      const ads = await Ads.find({ active: true });
      return res.status(200).json({
        success: true,
        message: "ads fetched successfully",
        data: ads,
      });
    }

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Decrypt user data
    let decryptedDob = null;
    if (user.dob) {
      decryptedDob = decryptData(user.dob);
    }
    let decryptedGender = null;
    if (user.gender) {
      decryptedGender = decryptData(user.gender);
    }

    // Calculate user's age from date of birth
    let userAge = null;
    if (decryptedDob) {
      const today = new Date();
      const birthDate = new Date(decryptedDob);
      userAge = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ) {
        userAge--;
      }
    }

    // Build targeting conditions array
    const targetingConditions = [{ active: true }];

    // Add gender condition
    if (decryptedGender) {
      targetingConditions.push({
        $or: [
          { "targeting.gender": "all" },
          { "targeting.gender": { $exists: false } },
          { "targeting.gender": decryptedGender },
        ],
      });
    }

    // Add age condition
    if (userAge !== null) {
      targetingConditions.push({
        $or: [
          { "targeting.age": { $exists: false } },
          { "targeting.age.min": { $exists: false } },
          { "targeting.age.max": { $exists: false } },
          {
            $and: [
              { "targeting.age.min": { $exists: true } },
              { "targeting.age.max": { $exists: true } },
              { "targeting.age.min": { $lte: userAge } },
              { "targeting.age.max": { $gte: userAge } },
            ],
          },
        ],
      });
    }

    // Add interests condition (if user has interests and ad has interests targeting)
    // Note: You'll need to add interests field to user model if not already present
    if (user.interests && user.interests.length > 0) {
      targetingConditions.push({
        $or: [
          { "targeting.interests": { $exists: false } },
          { "targeting.interests": { $size: 0 } },
          { "targeting.interests": { $in: user.interests } },
        ],
      });
    }

    // If no targeting conditions were added, just get active ads
    if (targetingConditions.length === 1) {
      const ads = await Ads.find({ active: true });
      return res.status(200).json({
        success: true,
        message: "ads fetched successfully",
        data: ads,
      });
    }

    // Get ads that satisfy ALL targeting conditions
    const ads = await Ads.find({
      $and: targetingConditions,
    });

    if (!ads || ads.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No Ads data found for your profile",
        data: [],
      });
    }

    return res.status(200).json({
      success: true,
      message: "ads fetched successfully",
      data: ads,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Get all ads
exports.getallAds = async (req, res) => {
  try {
    const ads = await Ads.find();

    if (!ads || ads.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No Ads data found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "ads fetched successfully",
      data: ads,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Add new ads
exports.createAds = async (req, res) => {
  try {
    const { title, active, targeting } = req.body;
    if (!req.files)
      return res
        .status(400)
        .json({ success: false, message: "No video uploaded" });

    // Parse targeting if sent as JSON string (from FormData)
    let targetingObj = targeting;
    if (typeof targeting === "string") {
      targetingObj = JSON.parse(targeting);
    }
    if (
      targetingObj &&
      targetingObj.interests &&
      typeof targetingObj.interests === "string"
    ) {
      targetingObj.interests = targetingObj.interests
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    const filedata = await fileupload(req.files.video[0].path, "ads");
    if (!filedata || !filedata.Location) {
      if (req.files.video[0].path && fs.existsSync(req.files.video[0].path))
        fs.unlinkSync(req.files.video[0].path);
      return res
        .status(500)
        .json({ success: false, message: "Cloudinary upload failed" });
    }

    // Save to DB
    const newAds = new Ads({
      title,
      video: {
        url: filedata.Location,
        public_id: filedata.public_id,
      },
      active,
      targeting: targetingObj,
    });
    await newAds.save();

    // Remove local file
    if (req.files.video[0].path && fs.existsSync(req.files.video[0].path))
      fs.unlinkSync(req.files.video[0].path);

    await invalidateCache("cache:GET:/api/getallads");
    return res.status(200).json({
      success: true,
      message: "Ads created successfully",
      data: newAds,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Update ads
exports.updateAds = async (req, res) => {
  try {
    const { title, active, targeting } = req.body;
    const { id } = req.params;
    let updateData = { title, active };

    // Parse targeting if sent as JSON string (from FormData)
    let targetingObj = targeting;
    if (typeof targeting === "string") {
      targetingObj = JSON.parse(targeting);
    }

    if (
      targetingObj &&
      targetingObj.interests &&
      typeof targetingObj.interests === "string"
    ) {
      targetingObj.interests = targetingObj.interests
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    if (targetingObj) updateData.targeting = targetingObj;

    // If a new video is uploaded, handle it
    if (req.files && req.files.video) {
      const filedata = await fileupload(req.files.video[0].path, "ads");
      if (!filedata || !filedata.Location) {
        if (req.files.video[0].path && fs.existsSync(req.files.video[0].path))
          fs.unlinkSync(req.files.video[0].path);
        return res
          .status(500)
          .json({ success: false, message: "Cloudinary upload failed" });
      }
      updateData.video = {
        url: filedata.Location,
        public_id: filedata.public_id,
      };
      if (req.files.video[0].path && fs.existsSync(req.files.video[0].path))
        fs.unlinkSync(req.files.video[0].path);
    }

    const ads = await Ads.findByIdAndUpdate(id, updateData, { new: true });
    if (!ads)
      return res.status(404).json({ success: false, message: "Ads not found" });

    await invalidateCache("cache:GET:/api/getallads");
    return res.status(200).json({
      success: true,
      message: "Ads updated successfully",
      data: { ads },
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Delete ads
exports.deleteAds = async (req, res) => {
  try {
    const { id } = req.params;
    const ads = await Ads.findByIdAndDelete(id);
    if (!ads)
      return res.status(404).json({ success: false, message: "Ads not found" });
    await invalidateCache("cache:GET:/api/getallads");
    return res.status(200).json({
      success: true,
      message: "Ads deleted successfully",
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

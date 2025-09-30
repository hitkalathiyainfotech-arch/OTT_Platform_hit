const mongoose = require("mongoose");
const Feature = require("../models/Feature.model");
const ThrowError = require("../utils/ErrorUtils").ThrowError;
const { invalidateCache } = require("../middleware/cache");

// Create Feature
exports.createFeature = async function (req, res) {
  try {
    const { FeatureName } = req.body;

    const checkMail = await Feature.findOne({ FeatureName });

    if (checkMail) {
      return res.status(409).json({
        message: "Feature already exists...",
        success: false,
        data: checkMail,
      });
    }

    const savedata = await Feature.create({
      FeatureName,
    });

    await invalidateCache("cache:GET:/api/getallfeature");
    return res.status(200).json({
      message: "Feature create successfully...",
      success: true,
      data: savedata,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Get all Feature
exports.getAllFeature = async function (req, res) {
  try {
    const data = await Feature.find();

    if (!data) {
      return res.status(200).json({ message: "No any Feature found!!" });
    }

    return res.status(200).json({
      message: "Feature fetched successfully",
      count: data.length,
      data: data,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

//getFeatureById
exports.getFeatureById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Feature ID" });
    }

    const data = await Feature.findById(id);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Feature not found",
      });
    }

    return res.status(200).json({
      message: "Feature fetched successfully",
      data,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

//updateFeature
exports.updateFeature = async (req, res) => {
  try {
    const { FeatureName } = req.body;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Feature ID" });
    }

    const updateData = { FeatureName };
    const updated = await Feature.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "Feature not found" });
    }

    await invalidateCache("cache:GET:/api/getallfeature");
    return res.status(200).json({
      message: "Feature updated successfully",
      data: updated,
      success: true,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  } /*  */
};

//deleteFeature
exports.deleteFeature = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Feature ID" });
    }

    const deletedFeature = await Feature.findByIdAndDelete(id);
    if (!deletedFeature) {
      return res.status(404).json({
        success: false,
        message: "Feature not found",
      });
    }

    await invalidateCache("cache:GET:/api/getallfeature");
    return res.status(200).json({
      success: true,
      message: "Feature deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

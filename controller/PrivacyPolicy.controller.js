const privacyPolicyServices = require("../models/PrivacyPolicy.model.js");
const ThrowError = require("../utils/ErrorUtils.js");
const mongoose = require("mongoose");
const { invalidateCache } = require("../middleware/cache");

//createprivacyPolicy
exports.createprivacyPolicy = async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res
        .status(400)
        .json({ message: "tittle or description must be required!!!" });
    }

    const savedata = await privacyPolicyServices.create({
      title,
      description,
    });

    await invalidateCache("cache:GET:/api/getAllprivacyPolicy");

    return res.status(200).json({
      message: "Terms and Condition created successfully...",
      data: savedata,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

//getAllprivacyPolicy
exports.getAllprivacyPolicy = async (req, res) => {
  try {
    const data = await privacyPolicyServices.find();

    if (!data) {
      return res.status(200).json({ message: "No any data found!!" });
    }

    return res.status(200).json({
      message: "data fetched successfully",
      data: data,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

//getprivacyPolicyById
exports.getprivacyPolicyById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid privacyPolicy ID" });
    }

    const data = await privacyPolicyServices.findById(id);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "privacyPolicy not found",
      });
    }

    return res.status(200).json({
      message: "privacyPolicy fetched successfully",
      data,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

//updateprivacyPolicy
exports.updateprivacyPolicy = async (req, res) => {
  try {
    const { title, description } = req.body;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid privacyPolicy ID" });
    }

    const updateData = { title, description };
    const updated = await privacyPolicyServices.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "privacyPolicy not found" });
    }

    await invalidateCache("cache:GET:/api/getAllprivacyPolicy");
    await invalidateCache(`cache:GET:/api/getprivacyPolicyById/${id}`);

    return res.status(200).json({
      message: "privacyPolicy updated successfully",
      data: updated,
      success: true,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

//deleteprivacyPolicy
exports.deleteprivacyPolicy = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid privacyPolicy ID" });
    }

    const deletedprivacyPolicy = await privacyPolicyServices.findByIdAndDelete(
      id
    );
    if (!deletedprivacyPolicy) {
      return res.status(404).json({
        success: false,
        message: "privacyPolicy not found",
      });
    }

    await invalidateCache("cache:GET:/api/getAllprivacyPolicy");
    await invalidateCache(`cache:GET:/api/getprivacyPolicyById/${id}`);

    return res.status(200).json({
      success: true,
      message: "privacyPolicy deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

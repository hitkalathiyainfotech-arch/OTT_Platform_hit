const termsConditionServices = require("../models/TermsConditions.model.js");
const ThrowError = require("../utils/ErrorUtils.js");
const mongoose = require("mongoose");
const { invalidateCache } = require("../middleware/cache");

//createTermsCondition
exports.createTermsCondition = async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res
        .status(400)
        .json({ message: "tittle or description must be required!!!" });
    }

    const savedata = await termsConditionServices.create({
      title,
      description,
    });

    await invalidateCache("cache:GET:/api/getAllTermsCondition");

    return res.status(200).json({
      message: "Terms and Condition created successfully...",
      data: savedata,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

//getAllTermsCondition
exports.getAllTermsCondition = async (req, res) => {
  try {
    const data = await termsConditionServices.find();

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

//getTermsConditionById
exports.getTermsConditionById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid TermsCondition ID" });
    }

    const data = await termsConditionServices.findById(id);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "TermsCondition not found",
      });
    }

    return res.status(200).json({
      message: "TermsCondition fetched successfully",
      data,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

//updateTermsCondition
exports.updateTermsCondition = async (req, res) => {
  try {
    const { title, description } = req.body;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid TermsCondition ID" });
    }

    const updateData = { title, description };
    const updated = await termsConditionServices.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "TermsCondition not found" });
    }

    await invalidateCache("cache:GET:/api/getAllTermsCondition");
    await invalidateCache(`cache:GET:/api/getTermsConditionById/${id}`);

    return res.status(200).json({
      message: "TermsCondition updated successfully",
      data: updated,
      success: true,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

//deleteTermsCondition
exports.deleteTermsCondition = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid TermsCondition ID" });
    }

    const deletedTermsCondition =
      await termsConditionServices.findByIdAndDelete(id);
    if (!deletedTermsCondition) {
      return res.status(404).json({
        success: false,
        message: "TermsCondition not found",
      });
    }

    await invalidateCache("cache:GET:/api/getAllTermsCondition");
    await invalidateCache(`cache:GET:/api/getTermsConditionById/${id}`);

    return res.status(200).json({
      success: true,
      message: "TermsCondition deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const CookiePolicyServices = require("../models/CookiePolicy.model.js");
const ThrowError = require("../utils/ErrorUtils.js");
const mongoose = require("mongoose");
const { invalidateCache } = require("../middleware/cache");

//createCookiePolicy
exports.createCookiePolicy = async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res
        .status(400)
        .json({ message: "tittle or description must be required!!!" });
    }

    const savedata = await CookiePolicyServices.create({
      title,
      description,
    });

    await invalidateCache("cache:GET:/api/getAllcookiePolicy");

    return res.status(200).json({
      message: "Terms and Condition created successfully...",
      data: savedata,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

//getAllCookiePolicy
exports.getAllCookiePolicy = async (req, res) => {
  try {
    const data = await CookiePolicyServices.find();

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

//getCookiePolicyById
exports.getCookiePolicyById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid CookiePolicy ID" });
    }

    const data = await CookiePolicyServices.findById(id);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "CookiePolicy not found",
      });
    }

    return res.status(200).json({
      message: "CookiePolicy fetched successfully",
      data,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

//updateCookiePolicy
exports.updateCookiePolicy = async (req, res) => {
  try {
    const { title, description } = req.body;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid CookiePolicy ID" });
    }

    const updateData = { title, description };
    const updated = await CookiePolicyServices.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "CookiePolicy not found" });
    }

    await invalidateCache("cache:GET:/api/getAllcookiePolicy");
    await invalidateCache(`cache:GET:/api/getcookiePolicyById/${id}`);

    return res.status(200).json({
      message: "CookiePolicy updated successfully",
      data: updated,
      success: true,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

//deleteCookiePolicy
exports.deleteCookiePolicy = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid CookiePolicy ID" });
    }

    const deletedCookiePolicy = await CookiePolicyServices.findByIdAndDelete(
      id
    );
    if (!deletedCookiePolicy) {
      return res.status(404).json({
        success: false,
        message: "CookiePolicy not found",
      });
    }

    await invalidateCache("cache:GET:/api/getAllcookiePolicy");
    await invalidateCache(`cache:GET:/api/getcookiePolicyById/${id}`);

    return res.status(200).json({
      success: true,
      message: "CookiePolicy deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

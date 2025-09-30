const mongoose = require("mongoose");
const Faq = require("../models/faq.model");
const ThrowError = require("../utils/ErrorUtils").ThrowError;
const { invalidateCache } = require("../middleware/cache");

// Create FAQ
exports.createFaq = async function (req, res) {
  try {
    const { faqQuestion, faqAnswer } = req.body;

    if (!faqQuestion || !faqAnswer) {
      return res
        .status(400)
        .json({ message: "faqQuestion or faqAnswer must be required!!!" });
    }

    const savedata = await Faq.create({
      faqQuestion,
      faqAnswer,
    });

    await invalidateCache("cache:GET:/api/getAllFaqs");

    return res
      .status(200)
      .json({ message: "Faq created successfully...", data: savedata });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Get all FAQs
exports.getAllFaqs = async function (req, res) {
  try {
    const data = await Faq.find().sort({ createdAt: -1 });

    if (!data || data.length === 0) {
      return res.status(200).json({ message: "No any data found!!", data: [] });
    }

    return res.status(200).json({
      message: "data fetched successfully",
      data: data,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Get FAQ by ID
exports.getFaqById = async function (req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return ThrowError(res, 400, "Invalid FAQ ID");
    }

    const data = await Faq.findById(id);

    if (!data) {
      return ThrowError(res, 404, "FAQ not found");
    }

    return res.status(200).json({
      message: "FAQ fetched successfully",
      data: data,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

// Update FAQ
exports.updateFaq = async function (req, res) {
  try {
    const { faqQuestion, faqAnswer } = req.body;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid FAQ ID" });
    }

    const updateData = { faqQuestion, faqAnswer };

    const updateFaq = await Faq.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!updateFaq) {
      return res.status(404).json({ message: "FAQ not found" });
    }

    await invalidateCache("cache:GET:/api/getAllFaqs");
    await invalidateCache(`cache:GET:/api/getFaqById/${id}`);

    return res.status(200).json({
      message: "FAQ updated successfully",
      data: updateFaq,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Delete FAQ
exports.deleteFaq = async function (req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid FAQ ID" });
    }

    const deletedFaq = await Faq.findByIdAndDelete(id);
    if (!deletedFaq) {
      return res.status(404).json({
        success: false,
        message: "FAQ not found",
      });
    }

    await invalidateCache("cache:GET:/api/getAllFaqs");
    await invalidateCache(`cache:GET:/api/getFaqById/${id}`);

    return res.status(200).json({
      success: true,
      message: "FAQ deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

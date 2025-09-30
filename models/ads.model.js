const mongoose = require("mongoose");

const adsSchema = mongoose.Schema(
  {
    title: {
      type: String,
    },
    video: {
      url: { type: String, required: true },
      public_id: { type: String, required: true },
    },
    targeting: {
      age: {
        min: { type: Number },
        max: { type: Number },
      },
      gender: {
        type: String,
        enum: ["male", "female", "other", "all"],
        default: "all",
      },
      interests: {
        type: [String],
      },
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Ads", adsSchema);

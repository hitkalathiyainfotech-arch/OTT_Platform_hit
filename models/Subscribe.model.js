const mongoose = require('mongoose');

const subscribeSchema = mongoose.Schema(
  {
    email: {
      type: String
    },
    subscribe: {
      type: Boolean,
      default: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

module.exports = mongoose.model("subscribe", subscribeSchema);

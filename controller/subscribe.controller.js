const mongoose = require("mongoose");
const Subscribe = require("../models/Subscribe.model");
const { encryptData, decryptData } = require('../utils/encryption');
const ThrowError = require("../utils/ErrorUtils").ThrowError;
const userModel = require("../models/user.model.js")

// Create Subscribe
exports.createSubscribe = async function (req, res) {
  try {
    let { email, subscribe } = req.body;
    console.log("Request body:", req.body);

    if (!email) {
      return ThrowError(res, 400, "Email is required");
    }

    const encryptedEmail = encryptData(email);
    console.log("Encrypted email for DB:", encryptedEmail);

    const currentUserEmail = req.user?.email;
    if (!currentUserEmail) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const decryptedUserEmail = decryptData(currentUserEmail);
    console.log("Decrypted logged-in user email:", decryptedUserEmail);

    const user = await userModel.findOne({ email: encryptData(decryptedUserEmail) });
    if (!user) {
      console.log("User not found for email:", decryptedUserEmail);
      return res.status(404).json({ success: false, message: "User Not Found" });
    }

    const userId = user._id;
    console.log("User ID:", userId);

    let subscription = await Subscribe.findOne({ email: encryptedEmail });
    if (subscription) {
      subscription.subscribe = subscribe;
      subscription.userId = userId;
      await subscription.save();
      console.log("Updated existing subscription:", subscription);

      return res.status(200).json({
        message: "Subscription updated successfully",
        success: true,
        data: subscription
      });
    }

    const newSubscription = await Subscribe.create({
      email: encryptedEmail,
      subscribe,
      userId
    });
    console.log("New subscription created:", newSubscription);

    return res.status(200).json({
      message: "Subscription created successfully",
      success: true,
      data: newSubscription
    });

  } catch (error) {
    console.log("Error in createSubscribe:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
};


// Get all Subscribe
exports.getAllSubscribe = async function (req, res) {
  try {
    const data = await Subscribe.find()

    if (!data) {
      return res.status(200).json({ message: "No any data found!!" })
    }

    return res.status(200).json({
      message: "data fetched successfully",
      data: data
    });

  } catch (error) {
    return ThrowError(res, 500, error.message)
  }
};

//getSubscribeById
exports.getSubscribeById = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const subscriptions = await Subscribe.find({ userId });

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No subscriptions found for this user"
      });
    }

    return res.status(200).json({
      message: "Subscriptions fetched successfully",
      success: true,
      data: subscriptions
    });

  } catch (error) {
    return res.status(200).json({
      message: "Subscription created successfully",
      success: true,
      data: newSubscription
    });
  }
};

//updateSubscribe
exports.updateSubscribe = async (req, res) => {
  try {
    let { email, subscribe } = req.body;
    email = encryptData(email);

    const updateData = { email, subscribe };
    const updated = await Subscribe.findOneAndUpdate({ email }, updateData, { new: true });

    if (!updated) {
      return res.status(404).json({ message: "Subscribe not found" });
    }

    return res.status(200).json({
      message: "Unsubscribe successfully...",
      data: updated,
      success: true
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

//deleteSubscribe
exports.deleteSubscribe = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid Subscribe ID" });
    }

    const deletedSubscribe = await Subscribe.findByIdAndDelete(id);
    if (!deletedSubscribe) {
      return res.status(404).json({
        success: false,
        message: "Subscribe not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Subscribe deleted successfully"
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
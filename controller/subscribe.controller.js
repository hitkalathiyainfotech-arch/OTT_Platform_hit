const mongoose = require("mongoose");
const Subscribe = require("../models/Subscribe.model");
const { encryptData } = require('../utils/encryption');
const ThrowError = require("../utils/ErrorUtils").ThrowError;

// Create Subscribe
exports.createSubscribe = async function (req, res) {
    try {
        let { email, subscribe } = req.body;
        email = encryptData(email);

        const checkMail = await Subscribe.findOne({ email });

        if (checkMail) {
            checkMail.subscribe = subscribe;
            checkMail.save();
            return res.status(200).json({ message: "Subscribe successfully...", success: true, data: checkMail })
        }

        const savedata = await Subscribe.create({
            email,
            subscribe
        })

        return res.status(200).json({ message: "Subscribe successfully...", success: true, data: savedata })

    } catch (error) {
        return ThrowError(res, 500, error.message)
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
        const { id } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid Subscribe ID" });
        }

        const data = await Subscribe.findById(id);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Subscribe not found"
            });
        }

        return res.status(200).json({
            message: "Subscribe fetched successfully",
            data
        });

    } catch (error) {
        return ThrowError(res, 500, error.message)
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
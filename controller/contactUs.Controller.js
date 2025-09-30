const ThrowError = require("../utils/ErrorUtils.js");
const contactUsServices = require("../models/ContactUs.model.js");
const mongoose = require('mongoose');

// Create ContactUs
exports.createContactUs = async (req, res) => {
    try {
        const { firstName, lastName, email, mobileNo, message, isAccept } = req.body;

        if (!firstName || !lastName || !email || !mobileNo || !message || !isAccept) {
            return ThrowError(res, 400, "All fields (firstName, lastName, email, mobileNo, message) are required");
        }

        const newContact = await contactUsServices.create({
            firstName,
            lastName,
            email,
            mobileNo,
            message,
            isAccept
        });

        return res.status(201).json({
            success: true,
            message: "Contact created successfully",
            data: newContact
        });
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

// Get ContactUsby ID
exports.getContactUsById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid ID " });
        }

        const contact = await contactUsServices.findById(id);

        if (!contact) {
            return res.status(404).json({ success: false, message: "ContactUs not found" });
        }

        return res.status(200).json({ success: true, data: contact });
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

// Get All ContactsUs
exports.getAllContactUs = async (req, res) => {
    try {
        const contacts = await contactUsServices.find();

        if (!contacts || contacts.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No contact data found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Data fetched successfully",
            data: contacts
        });

    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};

//update ContactUs
exports.updateContactUs = async (req, res) => {
    try {
        const { firstName, lastName, email, mobileNo, message } = req.body;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ success: false, message: "Invalid Id" });
        }

        const updateData = { firstName, lastName, email, mobileNo, message };
        const updated = await contactUsServices.findByIdAndUpdate(id, updateData, { new: true });

        if (!updated) {
            return res.status(404).json({ message: "ContactUs not found" });
        }

        return res.status(200).json({
            message: "ContactUs updated successfully",
            data: updated
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

//deleteContactUs
exports.deleteContactUs = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid ContactUs ID" });
        }

        const deleteContactUs = await contactUsServices.findByIdAndDelete(id);
        if (!deleteContactUs) {
            return res.status(404).json({
                success: false,
                message: "ContactUs not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "ContactUs deleted successfully"
        });
    } catch (error) {
        return ThrowError(res, 500, error.message);
    }
};
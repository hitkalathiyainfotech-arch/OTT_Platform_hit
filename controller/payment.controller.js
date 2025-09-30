const Stripe = require("stripe");
const Payment = require('../models/payment.model');
const User = require('../models/user.model');
const mongoose = require('mongoose');
require("dotenv").config();
const stripToken = process.env.stripToken;
const stripe = Stripe(stripToken);

exports.createPayment = async (req, res) => {
    try {
        const { amount, period, cardHolder, PlanName, planId } = req.body;
        const userId = req.user.id;
        let startDate = new Date();
        let endDate;

        if (period === 'Month') {
            endDate = new Date(startDate);
            endDate.setMonth(startDate.getMonth() + 1);
        } else if (period === 'year') {
            endDate = new Date(startDate);
            endDate.setFullYear(startDate.getFullYear() + 1);
        }

        // 1. Create Stripe payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: "usd",
            payment_method_types: ["card"],
        });

        // 2. Save payment details in MongoDB
        const payment = new Payment({
            cardHolder,
            period,
            startDate,
            endDate,
            amount,
            userId,
            PlanName,
            planId
        });
        await payment.save();
        const user = await User.findByIdAndUpdate(userId, { $set: { plan: planId, startDate: startDate, endDate: endDate } }, { new: true });


        res.send({ message: "Payment Successful !", clientSecret: paymentIntent.client_secret, payment });
    } catch (error) {
        console.error("Stripe error:", error);
        res.status(500).json({ error: error.message });
    }
};

exports.getallPayment = async (req, res) => {
    try {
        const data = await Payment.aggregate([
            {
                $lookup: {
                    from: "users", // collection name in MongoDB (usually plural and lowercase)
                    localField: "userId",
                    foreignField: "_id",
                    as: "userData"
                }
            },
            {
                $unwind: {
                    path: "$user",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "premia", // replace with your actual plan collection name
                    localField: "planId",
                    foreignField: "_id",
                    as: "planData"
                }
            },
            {
                $unwind: {
                    path: "$plan",
                    preserveNullAndEmptyArrays: true
                }
            }
        ]);

        if (!data || data.length === 0) {
            return res.status(200).json({ message: "No any data found!!" });
        }

        return res.status(200).json({
            message: "data fetched successfully",
            data: data
        });
    } catch (error) {
        console.error("Stripe error:", error);
        res.status(500).json({ error: error.message });
    }
};

exports.getPaymentUser = async (req, res) => {
    try {
        let userId = req.user.id;
        // Convert to ObjectId if it's a string
        if (typeof userId === 'string') {
            userId = new mongoose.Types.ObjectId(userId);
        }
        const data = await Payment.aggregate([
            {
                $match: { userId: userId }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "userData"
                }
            },
            {
                $unwind: {
                    path: "$userData",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "premia",
                    localField: "planId",
                    foreignField: "_id",
                    as: "planData"
                }
            },
            {
                $unwind: {
                    path: "$planData",
                    preserveNullAndEmptyArrays: true
                }
            }
        ]);

        if (!data || data.length === 0) {
            return res.status(200).json({ message: "No any data found!!" });
        }

        return res.status(200).json({
            message: "data fetched successfully",
            data: data
        });
    } catch (error) {
        console.error("Stripe error:", error);
        res.status(500).json({ error: error.message });
    }
};
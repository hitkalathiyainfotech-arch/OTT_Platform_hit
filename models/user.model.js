// import mongoose from "mongoose";
const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
    firstName: {
        type: String,
        require: true
    },
    lastName: {
        type: String,
        require: true
    },
    phoneNo: {
        type: String,
        require: true
    },
    dob: {
        type: String,
        // require: true
    },
    email: {
        type: String,
        require: true,
        unique: true
    },
    password: {
        type: String,
        require: true
    },
    otp: {
        type: Number,
    },
    otpExpiry: {
        type: Date
    },
    photo: {
        type: String,
    },
    gender: {
        type: String,
        // enum: ['male', 'female', 'other']
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    resetPasswordToken: {
        type: String
    },
    resetPasswordExpires: {
        type: Date
    },
    facebookId: {
        type: String
    },
    refreshToken: {
        type: String
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    watchlist: [{
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie' },
        thumbnails: Object,
        title: String
    }],
    startDate: {
        type: Date,
    },
    endDate: {
        type: Date,
    },
    plan: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
        ref: 'Premium',

    },
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date,
        default: null
    },
    devices: [{
        deviceId: String,
        deviceName: String,
        deviceType: String,
        lastLogin: {
            type: Date,
            default: Date.now
        }
    }],
    twoStepEnabled: {
        type: Boolean,
        default: false
    },
    twoStepOtp: {
        type: Number
    },
    twoStepOtpExpiry: {
        type: Date
    },
    activeStreams: [
        {
            deviceId: String,
            startedAt: {
                type: Date,
                default: Date.now
            }
        }
    ],
    parentalControl: {
        type: [String],
        enum: {
            values: ['U', 'U/A 7+', 'U/A 13+', 'U/A 16+', 'A'],
            message: 'Invalid content rating value'
        },
        default: [],
        validate: {
            validator: function (v) {
                // Allow empty array
                if (v.length === 0) return true;
                // Check if all values are valid enum values
                return v.every(item => ['U', 'U/A 7+', 'U/A 13+', 'U/A 16+', 'A'].includes(item));
            },
            message: 'Invalid content rating values'
        }
    },
    isEnabled: {
        type: Boolean,
        default: false
    },
    screenTimeLimit: {
        type: Boolean,
        default: false
    },
    timelimit: {
        type: String
    },
    alertWhenLimitExceeded: {
        type: Boolean,
        default: false
    },
    screenTimeUsage: {
        type: Number,
        default: 0
    },
    screenTimeUsageDate: {
        type: String,
        default: null
    },
    blockInappropriateContent: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    versionKey: false
});

module.exports = mongoose.model("User", userSchema);
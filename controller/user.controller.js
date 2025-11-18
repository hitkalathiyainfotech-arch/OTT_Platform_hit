const user = require('../models/user.model');
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const nodemailer = require("nodemailer");
const { fileupload } = require('../helper/cloudinary');
const fs = require("fs");
const { getSocketIdForDevice } = require('../helper/socketManager');
const mongoose = require('mongoose');
const { encryptData } = require('../utils/encryption');

// Initialize Twilio client
let twilioClient;
try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        console.warn('Twilio credentials not found. SMS functionality will be disabled.');
    } else {
        twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }
} catch (error) {
    console.error('Failed to initialize Twilio client:', error);
}

const generateTokens = async (id) => {
    try {
        const userData = await user.findOne({ _id: id });
        if (!userData) {
            throw new Error("User not found");
        }

        const accessToken = await jwt.sign(
            {
                _id: userData._id,
            },
            process.env.SECRET_KEY,
            { expiresIn: "60m" }
        );

        const refreshToken = await jwt.sign(
            {
                _id: userData._id,
            },
            process.env.REFRESH_SECRET_KEY,
            { expiresIn: "15d" }
        );

        userData.refreshToken = encryptData(refreshToken);
        await userData.save({ validateBeforeSave: false });

        return {
            accessToken: encryptData(accessToken), // Encrypt accessToken
            refreshToken: userData.refreshToken, // Already encrypted
        };
    } catch (error) {
        throw new Error(error.message);
    }
};


exports.createNewUser = async (req, res) => {
    try {
        let { firstName, lastName, email, password, phoneNo, gender, plan, deviceId, deviceType, deviceName, parentalControl, dob } = req.body;

        // Encrypt the sensitive fields
        firstName = encryptData(firstName);
        lastName = encryptData(lastName);
        email = encryptData(email);
        phoneNo = encryptData(phoneNo);
        gender = encryptData(gender);
        dob = encryptData(dob);

        let checkExistUser = await user.findOne({ $or: [{ email }, { phoneNo }] });

        if (checkExistUser) {
            if (checkExistUser.email !== email && checkExistUser.phoneNo === phoneNo) {
                return res
                    .status(409)
                    .json({ status: 409, message: "Phone no is registered with a different email ID" });
            } else if (checkExistUser.email === email && checkExistUser.phoneNo !== phoneNo) {
                return res
                    .status(409)
                    .json({ status: 409, message: "Email ID is registered with a different Phone no" });
            }
        }

        let salt = await bcrypt.genSalt(10);
        let hashPassword = await bcrypt.hash(password, salt);
        // let otp = Math.floor(Math.random() * (9999 - 1000 + 1)) + 1000;
        const otp = 1234;
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        // Check if Twilio is configured
        // if (!twilioClient) {
        //   return res.status(503).json({
        //     status: 503,
        //     message: "SMS service is not configured. Please contact the administrator."
        //   });
        // }

        // Send OTP via SMS
        // await twilioClient.messages.create({
        //   body: `Your OTP is: ${otp}`,
        //   from: process.env.TWILIO_PHONE_NUMBER,
        //   to: mobileNumber
        // });

        // checkExistUser = await user.create({
        //     firstName,
        //     lastName,
        //     email,
        //     phoneNo,
        //     password: hashPassword,
        //     otp,
        //     otpExpiry,
        //     isVerified: false
        // });
        if (!checkExistUser) {
            checkExistUser = await user.create({
                firstName,
                lastName,
                email,
                phoneNo,
                dob,
                password: hashPassword,
                otp,
                otpExpiry,
                gender,
                parentalControl,
                plan: '6874b3a50ba9a080d12076cc',
                role: 'user', // Explicitly set role
                devices: [{
                    deviceId,
                    deviceType,
                    deviceName,
                    lastLogin: new Date(),
                }]
            });
        } else {
            checkExistUser.otp = otp
            checkExistUser.otpExpiry = otpExpiry
            chekUser.photo = photo; // update photo every login
            await checkExistUser.save()
        }

        // await sendOtpEmail(email, otp);

        return res.status(201).json({
            status: 201,
            message: "User Created SuccessFully...",
            user: checkExistUser,
            success: true
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: error.message });
    }
};

//sendOtpEmail
exports.sendOtpEmail = async (toEmail, otp) => {
    try {
        let transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 3000,
            auth: {
                user: process.env.MY_GMAIL,
                pass: process.env.MY_PASSWORD
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        await transporter.verify();
        let mailOptions = {
            from: process.env.MY_GMAIL,
            to: toEmail,
            subject: 'Your Otp Code',
            text: `Your OTP code is ${otp}`,
        }

        await transporter.sendMail(mailOptions);

    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: error.message });
    }
}

//verifyOtp
exports.verifyOtp = async (req, res) => {
    try {
        let { phoneNo, otp, forgotPass } = req.body;

        phoneNo = encryptData(phoneNo);

        const userData = await user.findOne({ phoneNo });


        if (!userData) {
            return res.status(404).json({ message: 'User not found' });
        }

        // First check if OTP expired
        if (userData.otpExpiry < Date.now()) {
            return res.status(400).json({ message: 'OTP has expired' });
        }

        // Then check if OTP is correct
        if (userData.otp != otp) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        if (forgotPass) {
            userData.otp = null;
            userData.otpExpiry = null;
            await userData.save();
            return res.status(200).json({
                status: 200,
                message: "Otp Verify SuccessFully...",
                success: true,
            });
        } else {
            // Update user verification status
            userData.isVerified = true;
            userData.otp = null;
            userData.otpExpiry = null;
            await userData.save();

            // Generate JWT token for immediate login
            // const token = jwt.sign({ _id: userData._id }, process.env.SECRET_KEY, { expiresIn: "1d" });
            const { accessToken, refreshToken } = await generateTokens(
                userData._id
            );

            return res.status(200).cookie("accessToken", accessToken, { httpOnly: true, secure: true, maxAge: 2 * 60 * 60 * 1000, sameSite: "Strict" })
                .cookie("refreshToken", refreshToken, {
                    httpOnly: true,
                    secure: true,
                    maxAge: 15 * 24 * 60 * 60 * 1000,
                    sameSite: "Strict",
                })
                .json({
                    success: true,
                    status: 200,
                    message: 'Registration completed successfully',
                    user: userData,
                    token: accessToken,
                });
        }
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

exports.getAllUsers = async (req, res) => {
    try {
        let page = parseInt(req.query.page);
        let pageSize = parseInt(req.query.pageSize);

        if (page < 1 || pageSize < 1) {
            return res.status(401).json({
                status: 401,
                message: "Page And PageSize Cann't Be Less Than 1",
            });
        }

        let paginatedUser;

        paginatedUser = await user.find();

        let count = paginatedUser.length;

        if (count === 0) {
            return res.status(404).json({ status: 404, message: "User Not Found" });
        }

        if (page && pageSize) {
            let startIndex = (page - 1) * pageSize;
            let lastIndex = startIndex + pageSize;
            paginatedUser = await paginatedUser.slice(startIndex, lastIndex);
        }

        return res.status(200).json({
            status: 200,
            totalUsers: count,
            message: "All Users Found SuccessFully...",
            user: paginatedUser,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: error.message });
    }
};

exports.getUserById = async (req, res) => {
    try {
        const userId = req.params.id;

        const users = await user.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(userId) } },
            {
                $lookup: {
                    from: 'premia',
                    localField: 'plan',
                    foreignField: '_id',
                    as: 'planDetails'
                }
            },
            {
                $lookup: {
                    from: 'subscribes', // Assuming the collection name for SubscribeUser is 'subscribes'
                    localField: 'email', // Match user email
                    foreignField: 'email', // Match against email in SubscribeUser
                    as: 'subscriptionDetails'
                }
            },
            { $unwind: { path: "$planDetails", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$subscriptionDetails", preserveNullAndEmptyArrays: true } } // Unwind subscription details
        ]);

        if (!users || users.length === 0) {
            return res.status(404).json({
                status: 404,
                message: "User not found",
            });
        } else {
            return res.status(200).json({
                status: 200,
                message: "User found successfully",
                user: {
                    ...users[0], // aggregation returns an array
                    subscribe: users[0].subscriptionDetails?.subscribe // Add subscribe status
                },
            });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            status: 500,
            message: error.message,
        });
    }
};

exports.updateUser = async (req, res) => {
    try {
        let photoUrl = undefined;

        // If there's a file uploaded, upload it to Cloudinary
        if (req.file) {
            try {
                // Upload file to Cloudinary
                const uploadResult = await fileupload(req.file.path, 'user-photos');

                if (uploadResult && uploadResult.url) {
                    photoUrl = uploadResult.url;

                    // Delete the local file after successful upload
                    fs.unlink(req.file.path, (err) => {
                        if (err) {
                            console.error('Error deleting local file:', err);
                        }
                    });
                } else {
                    throw new Error('Failed to upload file to Cloudinary');
                }
            } catch (uploadError) {
                console.error('Aws upload error:', uploadError);
                return res.status(500).json({
                    status: 500,
                    message: "Failed to upload image to Aws",
                    error: uploadError.message
                });
            }
        }

        // Update user with new data including photo URL
        const updateData = { ...req.body };
        console.log(updateData);


        if (typeof updateData.parentalControl === 'string') {
            updateData.parentalControl = updateData.parentalControl.split(',');
            // Optionally, trim spaces
            updateData.parentalControl = updateData.parentalControl.map(s => s.trim());
            console.log(updateData.parentalControl,"dfdfdf");
            
        }

        // Handle boolean conversions for parental control fields
        if (updateData.isEnabled !== undefined) {
            updateData.isEnabled = updateData.isEnabled === 'true' || updateData.isEnabled === true;
        }
        if (updateData.screenTimeLimit !== undefined) {
            updateData.screenTimeLimit = updateData.screenTimeLimit === 'true' || updateData.screenTimeLimit === true;
        }
        if (updateData.alertWhenLimitExceeded !== undefined) {
            updateData.alertWhenLimitExceeded = updateData.alertWhenLimitExceeded === 'true' || updateData.alertWhenLimitExceeded === true;
        }
        if (updateData.blockInappropriateContent !== undefined) {
            updateData.blockInappropriateContent = updateData.blockInappropriateContent === 'true' || updateData.blockInappropriateContent === true;
        }

        // Handle timelimit field properly
        if (updateData.timelimit !== undefined) {
            // If timelimit is 'null' string, empty string, or null, set it to null
            if (updateData.timelimit === 'null' || updateData.timelimit === '' || updateData.timelimit === null) {
                updateData.timelimit = null;
            } else {
                // If screenTimeLimit is disabled, set timelimit to null
                if (!updateData.screenTimeLimit) {
                    updateData.timelimit = null;
                } else {
                    // Ensure timelimit is a valid string for enabled screen time limit
                    updateData.timelimit = updateData.timelimit.toString();
                }
            }
        }

        // Handle parentalControl array properly
        if (updateData.parentalControl !== undefined) {
            // If blockInappropriateContent is disabled, set parentalControl to empty array
            if (!updateData.blockInappropriateContent) {
                updateData.parentalControl = [];
            } else {
                // If it's enabled, ensure we have valid values
                if (Array.isArray(updateData.parentalControl)) {
                    // Filter out any empty strings or invalid values
                    updateData.parentalControl = updateData.parentalControl.filter(item =>
                        item && item.trim() !== '' && ['U', 'U/A 7+', 'U/A 13+', 'U/A 16+', 'A'].includes(item.trim())
                    );
                } else {
                    updateData.parentalControl = [];
                }
            }
        }

        // Additional logic: If parental control is disabled, clear all related fields
        if (updateData.isEnabled === false) {
            updateData.screenTimeLimit = false;
            updateData.timelimit = null;
            updateData.alertWhenLimitExceeded = false;
            updateData.blockInappropriateContent = false;
            updateData.parentalControl = [];
            updateData.screenTimeUsage = null;
            updateData.screenTimeUsageDate = null;
        }

        if (photoUrl) {
            updateData.photo = photoUrl;
        }

        const updatedUser = await user.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );
        console.log("updatedUser", updatedUser.parentalControl);


        if (!updatedUser) {
            return res.status(404).json({
                status: 404,
                message: "User not found",
            });
        }

        return res.status(200).json({
            status: 200,
            message: "User updated successfully",
            user: updatedUser,
            success: true
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            status: 500,
            message: error.message,
        });
    }
};

exports.removeUser = async (req, res) => {
    try {
        let id = req.params.id

        let removeUser = await user.findById(id);

        if (!removeUser) {
            return res.json({ status: 400, message: "User Not Found" })
        }

        await user.findByIdAndDelete(id);

        return res.json({ status: 200, success: true, message: "User Deleted SuccessFully" })

    } catch (error) {
        res.json({ status: 500, message: error.message });
        console.log(error);
    }
}

exports.resetPassword = async (req, res) => {
    try {
        let { email, oldPassword, newPassword } = req.body;

        const users = await user.findOne({ email });
        if (!users) {
            return res.status(400).json({ message: "User Not Found" });
        }

        const isMatch = await bcrypt.compare(oldPassword, users.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Old password is incorrect" });
        }

        const salt = await bcrypt.genSalt(10);
        users.password = await bcrypt.hash(newPassword, salt);
        await users.save();

        return res.status(200).json({ status: 200, success: true, message: "Password updated successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
        console.log(error);
    }
};

exports.sendDeleteOtp = async (req, res) => {
    try {
        const { email, phoneNo } = req.body;

        let emailEnc = encryptData(email);
        let phoneNoEnc = encryptData(phoneNo);


        if (emailEnc) {
            let checkEmail = await user.findOne({ email: emailEnc });

            if (!checkEmail) {
                return res.status(404).json({ status: 404, message: "Email Not Found" });
            }

            const transport = nodemailer.createTransport({
                service: "Gmail",
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
            });

            let otp = Math.floor(1000 + Math.random() * 9000);

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: "Reset Password",
                text: `Your code is: ${otp} `,
            };

            checkEmail.otp = otp;

            await checkEmail.save();

            transport.sendMail(mailOptions, (error) => {
                if (error) {
                    console.log(error);
                    return res
                        .status(500)
                        .json({ status: 500, success: false, message: error.message });
                }
                return res.status(200).json({
                    status: 200,
                    success: true,
                    message: "Otp Sent SuccessFully on Email...",
                });
            });
        } else if (phoneNoEnc) {
            let checkphoneNo = await user.findOne({ phoneNo: phoneNoEnc });

            if (!checkphoneNo) {
                return res.status(404).json({ status: 404, message: "Phone No Not Found" });
            }

            const otp = 8888;
            // const otp = Math.floor(100000 + Math.random() * 900000);
            // Check if Twilio is configured
            // if (!twilioClient) {
            //   return res.status(503).json({
            //     status: 503,
            //     message: "SMS service is not configured. Please contact the administrator."
            //   });
            // }

            // Send OTP via SMS
            // await twilioClient.messages.create({
            //   body: `Your OTP is: ${otp}`,
            //   from: process.env.TWILIO_PHONE_NUMBER,
            //   to: phoneNo
            // });
            checkphoneNo.otp = otp;

            await checkphoneNo.save();

            return res.status(200).json({
                status: 200,
                success: true,
                message: "Otp Sent SuccessFully on Phone No...",
                otp: otp
            });
        } else {
            return res.status(400).json({ status: 400, message: "Please provide either email or phone number" });
        }

    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: error.message });
    }
}

exports.verifyDeleteOtp = async (req, res) => {
    try {
        let { email, phoneNo, otp } = req.body;

        email = encryptData(email);
        // phoneNo = encryptData(phoneNo);


        let checkEmail = await user.findOne({ email });
        // let checkPhoneNo = await user.findOne({ phoneNo });

        if (email && !checkEmail) {
            return res.status(404).json({ status: 404, message: "Email Not Found" });
        }

        // if (phoneNo && !checkPhoneNo) {
        //     return res.status(404).json({ status: 404, message: "Phone No Not Found" });
        // }

        if (email && checkEmail.otp != otp) {
            return res.status(404).json({ status: 404, message: "Invalid Otp for Email" });
        }

        if (phoneNo && checkPhoneNo.otp != otp) {
            return res.status(404).json({ status: 404, message: "Invalid Otp for Phone No" });
        }

        if (email) {
            checkEmail.otp = null;
            await checkEmail.save();
        }

        // if (phoneNo) {
        //     checkPhoneNo.otp = null;
        //     await checkPhoneNo.save();
        // }

        return res.status(200).json({
            status: 200,
            success: true,
            message: "Otp Verify SuccessFully...",
            user: email ? checkEmail : checkPhoneNo,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: error.message });
    }
};

exports.getDevices = async (req, res) => {
    try {
        const userId = req.user._id;

        const userData = await user.findById(userId);

        if (!userData) {
            return res.status(404).json({ status: 404, message: "User not found" });
        }

        return res.status(200).json({
            status: 200,
            devices: userData.devices || []
        });
    } catch (error) {
        console.error('Error getting devices:', error);
        return res.status(500).json({ status: 500, message: error.message });
    }
};

exports.logoutDevice = async (req, res) => {
    try {
        const { deviceId } = req.body;
        const userId = req.user._id;
        const socketId = getSocketIdForDevice(userId, deviceId);
        console.log('Preparing to emit force-logout. userId:', userId, 'deviceId:', deviceId, 'socketId:', socketId);
        // Find the user
        const userr = await user.findById(userId);
        if (!userr) {
            return res.status(404).json({
                status: 404,
                message: 'User not found'
            });
        }

        // Find the device in the user's devices array
        const deviceIndex = userr.devices.findIndex(d => d.deviceId === deviceId);
        if (deviceIndex === -1) {
            return res.status(404).json({
                status: 404,
                message: 'Device not found'
            });
        }

        // Remove the device from the array
        userr.devices.splice(deviceIndex, 1);
        await userr.save();

        // If this is the current device, also invalidate the token
        if (deviceId === req.user.deviceId) {
            // You might want to add the token to a blacklist here
            // or implement some other token invalidation mechanism
        }

        // Emit socket event to notify the device to logout
        if (global.io) {
            // Ensure deviceId is a string
            const deviceRoom = String(deviceId);
            console.log('Emitting force-logout event to device room:', deviceRoom, 'userId:', userId, 'deviceId:', deviceId);
            const room = global.io.sockets.adapter.rooms.get(deviceRoom);
            console.log('Room membership for', deviceRoom, ':', room ? Array.from(room) : 'Room not found');
            global.io.to(deviceRoom).emit('force-logout', {
                message: 'You have been logged out from another device'
            });
        } else {
            console.error('Socket.IO instance not found');
        }
        console.log("socketId", socketId);
        // if (socketId) {
        //     global.io.to(socketId).emit('force-logout', { reason: 'Logged out from another device' });
        // }

        return res.status(200).json({
            status: 200,
            message: 'Device logged out successfully'
        });
    } catch (error) {
        console.error('Error in logoutDevice:', error);
        return res.status(500).json({
            status: 500,
            message: 'Internal server error'
        });
    }
};

exports.enableTwoStep = async (req, res) => {
    try {
        const { email } = req.body;
        let emailEnc = encryptData(email);
        const userData = await user.findOne({ email: emailEnc });
        if (!userData) return res.status(404).json({ message: "User not found" });

        const otp = Math.floor(10 + Math.random() * 90);
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

        userData.twoStepOtp = otp;
        userData.twoStepOtpExpiry = otpExpiry;
        await userData.save();

        // Send OTP via email (reuse your sendNumberEmail)
        await exports.sendNumberEmail(email, otp);

        return res.status(200).json({ success: true, otp, message: "OTP sent to email" });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.sendNumberEmail = async (toEmail, otp) => {
    try {
        let transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 3000,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        await transporter.verify();
        let mailOptions = {
            from: process.env.EMAIL_USER,
            to: toEmail,
            subject: 'Your Number',
            text: `Your Number is ${otp}`,
        }

        await transporter.sendMail(mailOptions);

    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: error.message });
    }
}

// Verify 2FA OTP
exports.verifyTwoStep = async (req, res) => {
    try {
        let { email, otp, enable } = req.body;
        email = encryptData(email);

        const userData = await user.findOne({ email });
        if (!userData) return res.status(404).json({ message: "User not found" });

        if (userData.twoStepOtpExpiry < Date.now())
            return res.status(400).json({ message: "OTP expired" });

        if (userData.twoStepOtp != otp)
            return res.status(400).json({ message: "Invalid OTP" });

        userData.twoStepEnabled = !!enable; // true for enable, false for disable
        userData.twoStepOtp = null;
        userData.twoStepOtpExpiry = null;
        await userData.save();

        // Return updated user
        return res.status(200).json({
            success: true,
            message: `Two-step verification ${enable ? "enabled" : "disabled"}`,
            user: userData
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// Add to exports
exports.getScreenTimeRemaining = async (req, res) => {
    try {
        const userId = req.params.id;
        const userData = await user.findById(userId);
        if (!userData) return res.status(404).json({ message: "User not found" });

        // Reset usage if it's a new day
        const today = new Date().toISOString().slice(0, 10);
        let usage = userData.screenTimeUsage || 0;
        if (userData.screenTimeUsageDate !== today) {
            usage = 0;
        }

        // Calculate limit in ms
        const limitMs = userData.screenTimeLimit && userData.timelimit
            ? parseInt(userData.timelimit) * 60 * 60 * 1000
            : 0;
        const remaining = Math.max(0, limitMs - usage);

        return res.status(200).json({
            remaining,
            usage,
            limit: limitMs,
            today,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.updateScreenTimeUsage = async (req, res) => {
    try {
        const userId = req.params.id;
        const { addMs } = req.body; // ms to add
        // console.log("addMs", addMs);

        const userData = await user.findById(userId);
        if (!userData) return res.status(404).json({ message: "User not found" });

        const today = new Date().toISOString().slice(0, 10);
        let usage = userData.screenTimeUsage || 0;

        // Reset if new day
        if (userData.screenTimeUsageDate !== today) {
            usage = 0;
        }

        usage += addMs;

        userData.screenTimeUsage = usage;
        userData.screenTimeUsageDate = today;
        await userData.save();

        // Calculate limit in ms
        const limitMs = userData.screenTimeLimit && userData.timelimit
            ? parseInt(userData.timelimit) * 60 * 60 * 1000
            : 0;
        const remaining = Math.max(0, limitMs - usage);

        return res.status(200).json({
            remaining,
            usage,
            limit: limitMs,
            today,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
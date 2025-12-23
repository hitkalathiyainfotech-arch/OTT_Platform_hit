const user = require("../models/user.model");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const crypto = require("crypto"); // Add at the top
const twilio = require("twilio");
const axios = require("axios");
const Premium = require("../models/premium.Model");
const premiumModel = require("../models/premium.Model");
const { sendNumberEmail } = require("../controller/user.controller");
const { encryptData, decryptData } = require("../utils/encryption");

// Initialize Twilio client
let twilioClient;
try {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.warn(
      "Twilio credentials not found. SMS functionality will be disabled."
    );
  } else {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
} catch (error) {
  console.error("Failed to initialize Twilio client:", error);
}

// ===========================Token===================================

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
      { expiresIn: "2h" }
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
      accessToken: encryptData(accessToken),
      refreshToken: userData.refreshToken,
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

exports.generateNewToken = async (req, res) => {
  const token =
    req.cookies.refreshToken || req.header("Authorization").split(" ")[1];
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token not available",
    });
  }

  const tokenData = decryptData(token);

  jwt.verify(
    tokenData,
    process.env.REFRESH_SECRET_KEY,
    async function (err, decoded) {
      try {
        console.log(err);

        if (err) {
          return res.status(400).json({
            success: false,
            message: "Token invalid",
          });
        }
        const USERS = await user.findOne({ _id: decoded._id });
        if (!USERS) {
          return res.status(404).json({
            success: false,
            message: "User not found..!!",
          });
        }
        const { accessToken, refreshToken } = await generateTokens(decoded._id);

        const userDetails = await user
          .findOne({ _id: USERS._id })
          .select("-password -refreshToken");

        return res
          .status(200)
          .cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: true,
            maxAge: 2 * 60 * 60 * 1000,
            sameSite: "Strict",
          })
          .cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: true,
            maxAge: 15 * 24 * 60 * 60 * 1000,
            sameSite: "Strict",
          })
          .json({
            success: true,
            finduser: userDetails,
            accessToken: accessToken,
            refreshToken: refreshToken,
          });
      } catch (error) {
        return res.status(500).json({
          success: false,
          data: [],
          error: "Error in register user: " + error.message,
        });
      }
    }
  );
};

// ==================================================================

// ===========================PLAN CHECKING FUNCTION===================================

const checkAndUpdateUserPlan = async (userData) => {
  try {
    // Check if the plan has expired
    const currentDate = new Date();
    const endDate = userData.endDate;

    // Only expire the plan if currentDate is strictly after endDate (i.e., the next day)
    if (
      endDate &&
      currentDate.setHours(0, 0, 0, 0) > new Date(endDate).setHours(0, 0, 0, 0)
    ) {
      userData.plan = userData.plan; // your default plan ID
      userData.endDate = null;
      userData.startDate = null;
      await userData.save();
    }

    // Get plan name for device handling
    let planName = "Free"; // Default fallback
    if (userData.plan) {
      const planDoc = await Premium.findById(userData.plan);
      if (planDoc && planDoc.plan) {
        planName = planDoc.plan;
      }
    }

    return { userData, planName };
  } catch (error) {
    console.error("Error in checkAndUpdateUserPlan:", error);
    throw new Error("Failed to check and update user plan");
  }
};

// ===========================DEVICE HANDLING FUNCTION===================================

const handleDeviceLogin = async (
  userData,
  deviceId,
  deviceType,
  deviceName,
  planName
) => {
  try {
    // Initialize devices array if not exists
    userData.devices = userData.devices || [];

    // console.log(userData,planName,"planName");

    // Remove old device entry if exists

    const newDevice = {
      deviceId,
      deviceType,
      deviceName,
      lastLogin: new Date(),
    };

    // Find the premium plan data for the user's plan
    // Fetch the user's plan document to get device limit from features
    let planDoc = null;
    if (userData.plan) {
      // console.log("plan-------------------",userData.plan);

      planDoc = await premiumModel.findById(userData.plan);
    }
    let deviceLimit = 1; // Default device limit
    // console.log(planDoc,":planDoc",Array.isArray(planDoc.features));

    if (planDoc && Array.isArray(planDoc.features)) {
      // Find the feature that describes device limit
      const deviceFeature = planDoc.features.find(
        (f) => f.name && f.name.toLowerCase().includes("logged")
      );

      // console.log(deviceFeature,"================deviceFeature");

      if (deviceFeature && deviceFeature.description) {
        // Try to extract the number from the description, e.g. "Logged In 6 Devices"
        const match = deviceFeature.description.match(/(\d+)/);
        // console.log(match,"match999999999999999999");

        if (match && match[1]) {
          deviceLimit = parseInt(match[1], 10);
        }
      }
    }

    let loginPending = false;

    // console.log(deviceLimit, "deviceLimit");

    // Handle device limits based on plan's deviceLimit
    if (userData && userData.devices.length >= deviceLimit) {
      global.io.to(`${deviceId}`).emit("login-msg", {
        message: "Login Device limited Reached",
        devices: userData.devices,
        userId: userData._id,
      });
      loginPending = true;
    } else {
      userData.devices.push(newDevice);
    }
    // // Default fallback: only 1 device
    // if (userData && userData.devices.length >= 1 ) {
    //   global.io.to(`${deviceId}`).emit("login-msg", {
    //     message:
    //       "Login Device limited Reached",
    //     devices:userData.devices,
    //     userId:userData._id
    //   });
    //   loginPending = true
    // } else {
    //   userData.devices.push(newDevice);
    // }

    await userData.save();

    // Emit devices-updated event
    if (global.io) {
      global.io.to(`user-${userData._id}`).emit("devices-updated");
    }

    return { finalUserData: userData, loginPending };
  } catch (error) {
    console.error("Error in handleDeviceLogin:", error);
    throw new Error("Failed to handle device login");
  }
};

// ===========================UNIFIED LOGIN PROCESS===================================

const processUserLogin = async (userData, deviceId, deviceType, deviceName) => {
  try {
    // Step 1: Check and update user plan
    const { userData: updatedUser, planName } = await checkAndUpdateUserPlan(
      userData
    );

    // Step 2: Handle device login
    const { finalUserData, loginPending } = await handleDeviceLogin(
      updatedUser,
      deviceId,
      deviceType,
      deviceName,
      planName
    );

    // console.log("finalUserData", finalUserData, loginPending);

    return {
      userData: finalUserData,
      planName,
      loginPending,
    };
  } catch (error) {
    console.error("Error in processUserLogin:", error);
    throw error;
  }
};

// ====================================================================================
// Add new function for 2-step verification
exports.verifyTwoStepOTP = async (req, res) => {
  try {
    const { userId, otp, deviceId, deviceType, deviceName } = req.body;

    const userData = await user.findById(userId);
    if (!userData) {
      return res.status(404).json({
        status: 404,
        message: "User not found",
      });
    }

    // Check if OTP is expired
    if (userData.twoStepOtpExpiry < new Date()) {
      return res.status(400).json({
        status: 400,
        message: "OTP has expired. Please try logging in again.",
      });
    }

    // Check if OTP matches
    if (userData.twoStepOtp !== parseInt(otp)) {
      return res.status(400).json({
        status: 400,
        message: "Invalid OTP. Please try again.",
      });
    }

    // Clear OTP after successful verification
    userData.twoStepOtp = null;
    userData.twoStepOtpExpiry = null;
    await userData.save();

    // Process device login
    const loginResult = await processUserLogin(
      userData,
      deviceId,
      deviceType,
      deviceName
    );

    if (loginResult.loginPending) {
      return res.status(402).json({
        status: 402,
        message: "Maximum number of devices reached. Unable to log in.",
      });
    }

    const { accessToken, refreshToken } = await generateTokens(
      loginResult.userData._id
    );

    return res
      .status(200)
      .cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: true,
        maxAge: 2 * 60 * 60 * 1000,
        sameSite: "Strict",
      })
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: true,
        maxAge: 15 * 24 * 60 * 60 * 1000,
        sameSite: "Strict",
      })
      .json({
        success: true,
        status: 200,
        message: "2-step verification successful. Login completed.",
        user: loginResult.userData,
        token: accessToken,
      });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, message: error.message });
  }
};

exports.userLogin = async (req, res) => {
  try {
    let { email, phoneNo, password, deviceId, deviceType, deviceName } =
      req.body;

    email = email ? encryptData(email) : null;
    phoneNo = phoneNo ? encryptData(phoneNo) : null;

    let checkEmailIsExist;

    // Find user by email or phone number
    if (email) {
      checkEmailIsExist = await user.findOne({ email });
    } else {
      checkEmailIsExist = await user.findOne({ phoneNo });
    }

    if (!checkEmailIsExist) {
      return res.status(404).json({
        status: 404,
        message: email ? "Email Not found" : "Phone Number Not found",
      });
    }

    // --- LOGIN THROTTLING/LOCKOUT LOGIC ---
    // Check if user is currently locked out
    if (
      checkEmailIsExist.lockUntil &&
      checkEmailIsExist.lockUntil > Date.now()
    ) {
      const waitMinutes = Math.ceil(
        (checkEmailIsExist.lockUntil - Date.now()) / 60000
      );
      return res.status(429).json({
        status: 429,
        message: `Account locked due to multiple failed login attempts. Try again in ${waitMinutes} minute(s).`,
      });
    }

    let comparePassword = await bcrypt.compare(
      password,
      checkEmailIsExist.password
    );

    if (!comparePassword) {
      // Increment failed attempts
      checkEmailIsExist.failedLoginAttempts =
        (checkEmailIsExist.failedLoginAttempts || 0) + 1;
      // If failed 3 times, lock for 15 minutes
      if (checkEmailIsExist.failedLoginAttempts >= 3) {
        checkEmailIsExist.lockUntil = Date.now() + 15 * 60 * 1000; // 15 minutes
        await checkEmailIsExist.save();
        return res.status(429).json({
          status: 429,
          message:
            "Account locked due to multiple failed login attempts. Try again in 15 minutes.",
        });
      } else {
        await checkEmailIsExist.save();
        return res
          .status(404)
          .json({ status: 404, message: "Password Not Match" });
      }
    }

    // Reset failed attempts and lock on successful login
    checkEmailIsExist.failedLoginAttempts = 0;
    checkEmailIsExist.lockUntil = null;

    if (checkEmailIsExist.twoStepEnabled) {
      // Generate OTP for 2-step verification
      const otp = Math.floor(10 + Math.random() * 90);

      let dummyOtps = [];
      while (dummyOtps.length < 2) {
        let dummy = Math.floor(10 + Math.random() * 90);
        if (dummy !== otp && !dummyOtps.includes(dummy)) {
          dummyOtps.push(dummy);
        }
      }

      // Combine real OTP and dummy OTPs, then shuffle
      let otpOptions = [otp, ...dummyOtps];
      otpOptions = otpOptions.sort(() => Math.random() - 0.5);

      const encryptedOtpOptions = otpOptions.map((o) =>
        Buffer.from(o.toString()).toString("base64")
      );

      checkEmailIsExist.twoStepOtp = otp;
      checkEmailIsExist.twoStepOtpExpiry = new Date(
        Date.now() + 10 * 60 * 1000
      ); // 10 minutes expiry
      await checkEmailIsExist.save();

      await sendNumberEmail(checkEmailIsExist.email, otp);

      return res.status(200).json({
        status: 200,
        success: true,
        message:
          "2-step verification required. Please enter the OTP sent to your email or Sms.",
        requiresTwoStep: true,
        userId: checkEmailIsExist._id,
        options: encryptedOtpOptions,
      });
    }

    // Check if deviceId already exists in user's devices
    const deviceExists = (checkEmailIsExist.devices || []).some(
      (d) => d.deviceId === deviceId
    );

    let loginResult;
    if (deviceExists) {
      // If device already exists, skip device limit check and just update lastLogin
      checkEmailIsExist.devices = checkEmailIsExist.devices.map((d) =>
        d.deviceId === deviceId
          ? { ...d, lastLogin: new Date(), deviceType, deviceName }
          : d
      );
      await checkEmailIsExist.save();
      loginResult = {
        userData: checkEmailIsExist,
        loginPending: false,
      };
    } else {
      // Otherwise, process device login as usual
      loginResult = await processUserLogin(
        checkEmailIsExist,
        deviceId,
        deviceType,
        deviceName
      );
    }

    // console.log(loginResult, "loginResult");

    if (loginResult.loginPending) {
      return res.status(402).json({
        status: 402,
        message: "Maximum number of devices reached. Unable to log in.",
      });
    }

    const { accessToken, refreshToken } = await generateTokens(
      loginResult.userData._id
    );

    return res
      .status(200)
      .cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: true,
        maxAge: 2 * 60 * 60 * 1000,
        sameSite: "Strict",
      })
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: true,
        maxAge: 15 * 24 * 60 * 60 * 1000,
        sameSite: "Strict",
      })
      .json({
        success: true,
        status: 200,
        message: "User Login SuccessFully...",
        user: loginResult.userData,
        token: accessToken,
      });

    // let token = await jwt.sign(
    //   { _id: checkEmailIsExist._id },
    //   process.env.SECRET_KEY,
    //   { expiresIn: "1D" }
    // );
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, message: error.message });
  }
};

exports.googleLogin = async (req, res) => {
  try {
    let {
      uid,
      firstName,
      lastName,
      email,
      photo,
      deviceId,
      deviceType,
      deviceName,
    } = req.body;

    firstName = encryptData(firstName);
    lastName = encryptData(lastName);
    email = encryptData(email);

    let checkUser = await user.findOne({ email });
    if (!checkUser) {
      checkUser = await user.create({
        uid,
        firstName,
        lastName,
        email,
        photo,
        plan: "6874b3a50ba9a080d12076cc",
        startDate: null,
        endDate: null,
        role: "user", // Explicitly set role
      });
    }
    checkUser.isVerified = true;

    // // --- DEVICE HANDLING ---
    // checkUser.devices = checkUser.devices || [];
    // // Remove old device entry if exists
    // checkUser.devices = checkUser.devices.filter(d => d.deviceId !== deviceId);
    // // Add/update current device (to the end of the array)
    // checkUser.devices.push({
    //   deviceId,
    //   deviceType,
    //   deviceName,
    //   lastLogin: new Date(),
    // });
    // // FIFO: If more than 6 devices, remove the oldest (first in array)
    // while (checkUser.devices.length > 6) {
    //   checkUser.devices.shift();
    // }
    // await checkUser.save();

    // // Check if the plan has expired
    // const currentDate = new Date();
    // const endDate = checkUser.endDate;
    // if (endDate && currentDate.setHours(0, 0, 0, 0) > new Date(endDate).setHours(0, 0, 0, 0)) {
    //   checkUser.plan = '6874b3a50ba9a080d12076cc';
    //   checkUser.endDate = null;
    //   checkUser.startDate = null;
    //   await checkUser.save();
    // }
    // checkUser = checkUser.toObject();
    // const { accessToken, refreshToken } = await generateTokens(checkUser._id);
    const loginResult = await processUserLogin(
      checkUser,
      deviceId,
      deviceType,
      deviceName
    );

    if (loginResult.loginPending) {
      return res.status(402).json({
        status: 402,
        message: "Maximum number of devices reached. Unable to log in.",
      });
    }

    const { accessToken, refreshToken } = await generateTokens(
      loginResult.userData._id
    );

    return res
      .status(200)
      .cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: true,
        maxAge: 2 * 60 * 60 * 1000,
        sameSite: "None",
      })
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: true,
        maxAge: 15 * 24 * 60 * 60 * 1000,
        sameSite: "None",
      })
      .json({
        message: "login successful",
        success: true,
        user: checkUser,
        token: accessToken,
        refreshToken: refreshToken,
      });
  } catch (error) {
    throw new Error(error);
  }
};

// exports.facebookLogin = async (req, res) => {
//   try {
//     let { uid, firstName, lastName, email, photo } = req.body;
//     let checkUser = await user.findOne({ email });
//     if (!checkUser) {
//       checkUser = await user.create({
//         uid,
//         firstName, lastName,
//         email,
//         photo
//       });
//     }
//     checkUser.isVerified = true;
//     await checkUser.save()
//     checkUser = checkUser.toObject();
//     let token = await jwt.sign({ _id: checkUser._id }, process.env.SECRET_KEY, { expiresIn: "1D" })
//     // checkUser.token = generateToken(checkUser._id);
//     return res.status(200).json({ message: 'login successful', success: true, user: checkUser, token: token });
//   } catch (error) {
//     throw new Error(error);
//   }
// };

exports.facebookLogin = async (req, res) => {
  try {
    const { accessTokenf, userID, deviceId, deviceType, deviceName } = req.body;
    // 1. Verify token with Facebook
    const fbRes = await axios.get(
      `https://graph.facebook.com/v12.0/me?access_token=${accessTokenf}&fields=id,first_name,last_name,email,picture,gender`
    );
    if (fbRes.data.id !== userID) {
      return res.status(401).json({ message: "Invalid Facebook user." });
    }
    // 2. Find or create user in your DB
    let checkUser = await user.findOne({ facebookId: fbRes.data.id });
    fbRes.data.phone_number = encryptData(fbRes.data.phone_number);
    fbRes.data.email = encryptData(fbRes.data.email);
    fbRes.data.first_name = encryptData(fbRes.data.first_name);
    fbRes.data.last_name = encryptData(fbRes.data.last_name);
    fbRes.data.gender = encryptData(fbRes.data.gender);
    if (!checkUser) {
      checkUser = await user.create({
        facebookId: fbRes.data.id,
        firstName: fbRes.data.first_name,
        lastName: fbRes.data.last_name,
        email: fbRes.data.email,
        photo: fbRes.data.picture?.data?.url,
        phoneNo: fbRes.data.phone_number,
        gender: fbRes.data.gender,
        isVerified: true,
        role: "user", // Explicitly set role
        plan: "6874b3a50ba9a080d12076cc",
      });
    }
    checkUser.isVerified = true;
    // // --- DEVICE HANDLING ---
    // checkUser.devices = checkUser.devices || [];
    // // Remove old device entry if exists
    // checkUser.devices = checkUser.devices.filter(d => d.deviceId !== deviceId);
    // // Add/update current device (to the end of the array)
    // checkUser.devices.push({
    //   deviceId,
    //   deviceType,
    //   deviceName,
    //   lastLogin: new Date(),
    // });
    // // FIFO: If more than 6 devices, remove the oldest (first in array)
    // while (checkUser.devices.length > 6) {
    //   checkUser.devices.shift();
    // }
    // await checkUser.save();
    // checkUser = checkUser.toObject();

    const loginResult = await processUserLogin(
      checkUser,
      deviceId,
      deviceType,
      deviceName
    );

    if (loginResult.loginPending) {
      return res.status(402).json({
        status: 402,
        message: "Maximum number of devices reached. Unable to log in.",
      });
    }

    const { accessToken, refreshToken } = await generateTokens(checkUser._id);
    return res
      .status(200)
      .cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: true,
        maxAge: 2 * 60 * 60 * 1000,
        sameSite: "None",
      })
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: true,
        maxAge: 15 * 24 * 60 * 60 * 1000,
        sameSite: "None",
      })
      .json({
        message: "login successful",
        success: true,
        user: loginResult.userData,
        token: accessToken,
      });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Facebook authentication failed",
      error: error.message,
    });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email, phoneNo } = req.body;

    const emailEnc = email ? encryptData(email) : null;
    const phoneNoEnc = phoneNo ? encryptData(phoneNo) : null;

    if (emailEnc) {
      const userData = await user.findOne({ email: emailEnc });
      if (!userData) {
        return res.status(404).json({
          status: 404,
          success: false,
          message: "Email Not Found"
        });
      }

      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenExpiry = Date.now() + 60 * 60 * 1000;

      userData.resetPasswordToken = resetToken;
      userData.resetPasswordExpires = resetTokenExpiry;
      await userData.save();

      const transport = nodemailer.createTransport({
        service: "Gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Password Reset Token",
        text: `Your password reset token is: ${resetToken}. This token is valid for 1 hour.`,
        html: `
          <div style="font-family: Arial; color:#333">
            <h2>Password Reset</h2>
            <p>Your password reset token is:</p>
            <h3>${resetToken}</h3>
            <p>This token is valid for 1 hour.</p>
            <p>If you did not request this, please ignore this email.</p>
          </div>
        `
      };

      await transport.sendMail(mailOptions);

      return res.status(200).json({
        status: 200,
        success: true,
        message: "Reset token sent to email"
      });
    }

    if (phoneNoEnc) {
      const userData = await user.findOne({ phoneNo: phoneNoEnc });
      if (!userData) {
        return res.status(404).json({
          status: 404,
          success: false,
          message: "Phone No Not Found"
        });
      }

      const otp = Math.floor(1000 + Math.random() * 9000);
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

      userData.otp = otp;
      userData.otpExpiry = otpExpiry;
      await userData.save();

      return res.status(200).json({
        status: 200,
        success: true,
        message: "OTP sent to phone number"
      });
    }

    return res.status(400).json({
      status: 400,
      success: false,
      message: "Email or Phone number is required"
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      success: false,
      message: error.message
    });
  }
};


// exports.verifyOtp = async (req, res) => {
//   try {
//     let { phoneNo, otp } = req.body;
//     console.log(phoneNo, otp);

//     let chekcEmail = await user.findOne({ phoneNo });

//     if (!chekcEmail) {
//       return res.status(404).json({ status: 404, message: "Phone No Not Found" });
//     }

//     if (chekcEmail.otp != otp) {
//       return res.status(404).json({ status: 404, message: "Invalid Otp" });
//     }

//     chekcEmail.otp = undefined;

//     await chekcEmail.save();

//     return res.status(200).json({
//       status: 200,
//       message: "Otp Verify SuccessFully...",
//       user: chekcEmail,
//       success: true,
//     });
//   } catch (error) {
//     console.log(error);
//     return res.status(500).json({ status: 500, message: error.message });
//   }
// };

exports.changePassword = async (req, res) => {
  try {
    let { newPassword, email, verifyPhone } = req.body;

    let emailEnc = email ? encryptData(email) : null;
    let phoneNoEnc = verifyPhone ? encryptData(verifyPhone) : null;

    let userId = await user.findOne({
      $or: [{ email: emailEnc }, { phoneNo: phoneNoEnc }],
    });

    if (!userId) {
      return res.status(404).json({ status: 404, message: "User Not Found" });
    }

    let salt = await bcrypt.genSalt(10);
    let hashPassword = await bcrypt.hash(newPassword, salt);

    let updatePassword = await user.findByIdAndUpdate(
      userId._id,
      { password: hashPassword },
      { new: true }
    );

    return res.json({
      status: 200,
      success: true,
      message: "Password Changed SuccessFully...",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: 500, message: error.message });
  }
};

// exports.userLogout = async (req, res) => {
//   try {
//     const userlogout = await user.findByIdAndUpdate(req.params.id);
//   } catch (error) {
//     console.log("errr logouttt", error);
//   }

//   return res.status(200).json({
//     success: true,
//     message: "User logged Out",
//   });
// };

exports.userLogout = async (req, res) => {
  try {
    const { deviceId, userId } = req.body;
    // Remove the device with the given deviceId from the user's devices array and unset refreshToken
    const userData = await user.findOneAndUpdate(
      { _id: req.params.id || userId }, // fallback to userId from body if not in params
      {
        $pull: { devices: { deviceId: deviceId } },
        $unset: { refreshToken: 1 },
      },
      { new: true }
    );

    return res
      .status(200)
      .clearCookie("accessToken")
      .clearCookie("refreshToken")
      .json({
        success: true,
        data: userData,
        message: "user logout successfully",
      });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "user logout not complete" + error.message,
    });
  }
};

exports.sendOtpToMobile = async (req, res) => {
  try {
    let { mobileNumber } = req.body;

    // Generate a random OTP
    // let otp = Math.floor(Math.random() * (999999 - 100000 + 1)) + 100000;
    let otp = 1234;
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

    // Save the OTP to the user's record
    let checkUser = await user.findOne({ mobileNumber });
    if (!checkUser) {
      checkUser = new user({ mobileNumber, otp });
    } else {
      checkUser.otp = otp;
    }
    await checkUser.save();

    return res
      .status(200)
      .json({ status: 200, message: "OTP sent successfully." });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: error.message || "Failed to send OTP. Please try again later.",
    });
  }
};

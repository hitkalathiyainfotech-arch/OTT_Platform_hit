const user = require('../models/user.model');
const jwt = require('jsonwebtoken');
const { decryptData } = require('../utils/encryption'); // Import the decryption function

exports.auth = async (req, res, next) => {
    try {
        let authorization = req.cookies.accessToken || req.headers['authorization'];

        if (authorization) {
            // Remove 'Bearer ' if present, otherwise use the value as is
            let token = authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization;

            if (!token) {
                return res.status(404).json({ status: 404, message: "Token Is Required" });
            }

            // Decrypt the token before verifying
            token = decryptData(token); // Decrypt the token

            let checkToken;
            try {
                checkToken = jwt.verify(token, process.env.SECRET_KEY);
            } catch (err) {
                if (err.name === 'TokenExpiredError') {
                    return res.status(401).json({ status: 401, message: "jwt expired" });
                }
                return res.status(401).json({ status: 401, message: "Invalid token" });
            }

            let checkUser = await user.findById(checkToken); // Ensure to access _id from checkToken

            if (!checkUser) {
                return res.status(404).json({ status: 404, message: "User Not Found" });
            }

            req.user = checkUser;
            next();
        } else {
            return res.status(404).json({ status: 404, message: "Token Is Required" });
        }
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: error.message });
    }
};

// exports.movieAuth = async (req, res, next) => {
//     try {
//         let authorization = req.headers['authorization'] || req.cookies.accessToken

//         if (authorization) {
//             let token = await authorization.split(' ')[1]

//             if (token) {
//                 let checkToken;
//                 try {
//                     checkToken = jwt.verify(token, process.env.SECRET_KEY)
//                     let checkUser = await user.findById(checkToken)

//                     if (checkUser) {
//                         req.user = checkUser
//                     }
//                 } catch (err) {
//                     // Token is invalid or expired, but we continue without user data
//                     console.log("Token validation failed:", err.message)
//                 }
//             }
//         }

//         // Always proceed to next middleware/route handler
//         next()
//     } catch (error) {
//         console.log(error);
//         return res.status(500).json({ status: 500, message: error.message })
//     }
// }
exports.movieAuth = async (req, res, next) => {
    try {
        let authorization = req.cookies.accessToken || req.headers['authorization']

        if (authorization) {
            // console.log(authorization,"authorization");

            // Remove 'Bearer ' if present, otherwise use the value as is
            let token = authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization;

            // if (!token) {
            //     return res.status(404).json({ status: 404, message: "Token Is Required" })
            // }

            // Decrypt the token before verifying
            token = decryptData(token); // Decrypt the token

            let checkToken;
            try {
                checkToken = jwt.verify(token, process.env.SECRET_KEY)
            } catch (err) {
                if (err.name === 'TokenExpiredError') {
                    return res.status(401).json({ status: 401, message: "jwt expired" });
                }
                return res.status(401).json({ status: 401, message: "Invalid token" });
            }

            let checkUser = await user.findById(checkToken)

            if (!checkUser) {
                return res.status(404).json({ status: 404, message: "User Not Found" })
            }

            req.user = checkUser
            next()
        }
        else {
            next()
        }
        // next()
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: error.message })
    }
}
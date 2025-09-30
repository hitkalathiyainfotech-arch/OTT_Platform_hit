// back/utils/encryption.js
const CryptoJS = require("crypto-js");

// Must be 16 bytes (128 bits)
const FIXED_IV = CryptoJS.enc.Hex.parse('00000000000000000000000000000000'); 
const SECRET_KEY = CryptoJS.enc.Utf8.parse(process.env.SECRET_KEY); // exactly 16 chars


// Function to encrypt data
function encryptData(data) {
    // For phone numbers, hash using HMAC SHA256 with SECRET_KEY
    const encrypted = CryptoJS.AES.encrypt(data, SECRET_KEY, {
        iv: FIXED_IV,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });
    
      return encrypted.toString(); // base64
}

// Function to decrypt data
function decryptData(ciphertext) {
    const decrypted = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY, {
        iv: FIXED_IV,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });
    
      return decrypted.toString(CryptoJS.enc.Utf8);
}

module.exports = { encryptData, decryptData };
const mongoose = require('mongoose');
require("dotenv").config()
const connectDb = async (req, res) => {
  try {
    await mongoose
      .connect(process.env.MONGODB_PATH || "mongodb+srv://Kalathiyainfotech:Vagh1803@cluster0.bpmjdep.mongodb.net/OTT_PLATFORM")
    console.log("Database connected successfully")
  } catch (error) {
    console.log(error);
  }
}

module.exports = connectDb;
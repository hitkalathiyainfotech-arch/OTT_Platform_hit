// import mongoose from "mongoose";
const mongoose = require('mongoose')

const movieCategory = new mongoose.Schema({
    categoryName: {
        type: String,
        unique: true
    },
    category_image: {
        url: { type: String},
        public_id: { type: String}
    },
    category_description: {
        type: String,
    }
}, {
    timestamps: true
})

module.exports = mongoose.model('MovieCategory', movieCategory)
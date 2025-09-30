const mongoose = require('mongoose');

const ContactUsSchema = mongoose.Schema({
    firstName: {
        type: String,
        require: true
    },
    lastName: {
        type: String,
        require: true
    },
    mobileNo: {
        type: Number,
        require: true
    },
    email: {
        type: String,
        require: true
    },
    message: {
        type: String,
        require: true
    },
    isAccept:{
        type: Boolean
    }
}, {
    timestamps: true,
    versionKey: false
});

module.exports = mongoose.model("ContactUs", ContactUsSchema);
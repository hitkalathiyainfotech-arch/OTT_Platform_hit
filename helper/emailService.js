const nodemailer = require("nodemailer");

// Create a transporter for sending emails
const transporter = nodemailer.createTransport({
  service: "Gmail", // or use "SendGrid", "Mailgun", etc.
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Function to send email about the new movie
const sendNewMovieMail = async (emails, movie) => {
  const mailOptions = {
    from: `"OTT Platform" <${process.env.EMAIL_USER}>`,
    to: emails.join(","),
    subject: `🎬 New Movie Added: ${movie.title}`,
    html: `
            <h2>${movie.title} is now available!</h2>
            <p>${movie.description}</p>
            <img src="${movie.thumbnail.url}" alt="Movie Thumbnail" style="width: 300px;" />
            <br />
            <a href="http://localhost:3000/movieDetail/${movie._id}">Check Out</a>
        `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("New movie email sent.");
  } catch (error) {
    console.error("Email error:", error);
  }
};

module.exports = { sendNewMovieMail };

const cluster = require("cluster");
const os = require("os");
require("dotenv").config();
const express = require("express");
const connectDb = require("./db/db");
const cors = require("cors");
const path = require("path");
const csrf = require("csurf");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const indexRoutes = require("./routes/index.routes");
const http = require("http");
const socketIo = require("socket.io");
const socketManager = require("./helper/socketManager");
const rateLimit = require("express-rate-limit");
const { redisClient, connectRedis } = require("./utils/redisClient"); // Import redisClient and connectRedis

// if (cluster.isMaster) {
//   const numCPUs = os.cpus().length;
//   console.log(`Master process ${process.pid} is running`);
//   // Fork workers.
//   for (let i = 0; i < numCPUs; i++) {
//     cluster.fork();
//   }
//   cluster.on("exit", (worker, code, signal) => {
//     console.log(`Worker ${worker.process.pid} died. Forking a new worker...`);
//     cluster.fork();
//   });
// } else {
// Worker processes run the server
// require("dotenv").config();
// const express = require("express");
// const connectDb = require("./db/db");
// const cors = require("cors");
// const path = require("path");
// const cookieParser = require("cookie-parser");
// const helmet = require("helmet");
// const indexRoutes = require("./routes/index.routes");
// const http = require("http");
// const socketIo = require("socket.io");

const app = express();

// Essential middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  return res.send("<h1>OTT Api is Live</h1>")
})

// Place rate limiter here
// app.use(
//   rateLimit({
//     windowMs: 15 * 60 * 1000, // 15 minutes
//     max: 100, // limit each IP to 100 requests per windowMs
//   })
// );

app.use(helmet());
app.use(helmet.frameguard({ action: "deny" }));
app.use(helmet.hidePoweredBy());
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'", "*.amazonaws.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "*.amazonaws.com", "*.googleusercontent.com"],
      connectSrc: [
        "'self'",
        "http://localhost:3001",
        "http://localhost:3000",
        "https://ott-platform-1-wlrw.onrender.com",
        "https://4krll6jd-3000.inc1.devtunnels.ms",
        "http://192.168.29.126:3000",
        "https://4krll6jd-3000.inc1.devtunnels.ms",
        "*.amazonaws.com",
        "*.googleusercontent.com",
      ],
      mediaSrc: ["'self'", "*.amazonaws.com"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      manifestSrc: ["'self'"],
    },
    reportOnly: false,
  })
);
app.use(helmet.crossOriginEmbedderPolicy({ policy: "require-corp" }));
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(cookieParser());
const port = process.env.PORT || 8000;

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

app.use(
  cors({
    origin: [
      "http://localhost:3001",
      "http://localhost:3000",
      "https://ott-platform-1-wlrw.onrender.com",
      "https://4krll6jd-3000.inc1.devtunnels.ms",
      "http://192.168.29.126:3000",
      "https://4krll6jd-3000.inc1.devtunnels.ms",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-CSRF-Token",
      "Range",
      "Accept",
      "Origin",
      "Access-Control-Allow-Headers",
    ],
    exposedHeaders: [
      "Content-Length",
      "Content-Range",
      "Content-Type",
      "Accept-Ranges",
      "ETag",
    ],
    credentials: true,
    maxAge: 3600,
  })
);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api", indexRoutes);

// --- Socket.IO integration starts here ---
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3001",
      "http://localhost:3000",
      "https://ott-platform-1-wlrw.onrender.com",
      "https://4krll6jd-3000.inc1.devtunnels.ms",
      "http://192.168.29.126:3000",
      "https://4krll6jd-3000.inc1.devtunnels.ms",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  },
});

global.io = io;
global.redisClient = redisClient; // Make redisClient globally accessible

// Delegate socket event handling to socketManager
socketManager.handleSocketEvents(io);



server.listen(port, () => {
  connectDb();
  connectRedis().catch((e) =>
    console.warn("Redis init failed, continuing without cache:", e.message)
  );
  console.log(
    `Worker ${process.pid} started. Server is running on port ${port}`
  );
});
// }

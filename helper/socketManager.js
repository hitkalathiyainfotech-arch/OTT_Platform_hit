const {addOrUpdateContinueWatching} = require("../controller/continueWatching.controller");
const premiumModel = require("../models/premium.Model");
const userData = require("../models/user.model");

function emitProgress(data) {
  if (global.io) {
    global.io.emit("uploadProgress", data);
  }
}

function emitProgressToUser(userId, data) {
  if (global.io) {
    global.io.to(`user-${userId}`).emit("uploadProgress", data);
  }
}

function emitProgressToDevice(deviceId, data) {
  if (global.io) {
    global.io.to(`${deviceId}`).emit("uploadProgress", data);
  }
}

const userDeviceSockets = {};
const deviceRooms = new Map();

// console.log("deviceRooms", deviceRooms);

function getSocketIdForDevice(userId, deviceId) {
  const deviceIdStr = String(deviceId);
  if (userDeviceSockets[userId] && userDeviceSockets[userId][deviceIdStr]) {
    return userDeviceSockets[userId][deviceIdStr];
  }
  console.warn(`No socket found for userId=${userId}, deviceId=${deviceIdStr}`);
  return null;
}
// ==================
// ========================================
async function getAllowedStreamsForPlan(plan) {
  const planObj = await premiumModel.findById(plan);
  if (!planObj || !Array.isArray(planObj.features)) return 1;

  // Find the "Watch" feature
  const watchFeature = planObj.features.find((f) => f.name === "Watch");
  if (!watchFeature || !watchFeature.description) return 1;

  const match = watchFeature.description.match(/(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 1; // fallback
}
// ==============================================================

function handleSocketEvents(io) {
  io.on("connection", (socket) => {
    // 1. Get token from socket handshake
    // const token = socket.handshake.auth?.token;

    // 2. (Optional) Validate token here (for now, just check if it exists)
    // if (!token) {
    //   console.log("Socket connection rejected: No token provided");
    //   socket.disconnect(true);
    //   return;
    // }
    // Update: global.io.sockets should be an array to store multiple sockets

    // 3. Listen for user-login event
    socket.on("user-login", (data) => {
      const { userId, deviceId, deviceType } = data;
      // console.log("=======asas======", userId, deviceId, deviceType, socket.id, "=========");

      socket.userId = userId;
      socket.deviceId = deviceId;
      if (!userDeviceSockets[userId]) userDeviceSockets[userId] = {};
      userDeviceSockets[userId][deviceId] = socket.id;
      // console.log(`User logged in: ${userId} (device: ${deviceId}, socket: ${socket.id})`);
      socket.join(`user-${userId}`);
      socket.join(`${deviceId}`);
      // Emit user-login event to all user's sockets

      // console.log(userDeviceSockets[userId], "-=---------------");

      Object.keys(userDeviceSockets[userId]).forEach((deviceId) => {
        // console.log(userDeviceSockets[userId], deviceId, "qqqwqwqwqw");
        // console.log(userDeviceSockets, "qqqwqwqwqw");

        global.io
          .to(userDeviceSockets[userId][deviceId])
          .emit("devices-updated", { userId, deviceId, deviceType });
      });
    });

    // 4. Listen for join-device-room event
    socket.on("join-device-room", (deviceId) => {
      socket.join(`${deviceId}`);
      socket.deviceId = deviceId;
      // console.log(`Socket ${socket.id} joined device room: ${deviceId}`,deviceId); // clearer log
      // console.log('Current rooms for socket:', Array.from(socket.rooms));
      deviceRooms.set(deviceId, socket.id);
    });

    // Handle force logout
    socket.on("force-logout-device", async (data) => {
      const { deviceId, userId } = data;
      // console.log("Handling force logout for device:", deviceId);

      // Get all sockets in the device room
      const deviceRoom = io.sockets.adapter.rooms.get(deviceId);
      // console.log(deviceRoom,"global.io");

      // if (deviceRoom) {
      // Emit force-logout event to all sockets in the device room
      global.io.to(deviceId).emit("force-logout", {
        message: "You have been logged out from another device",
      });

      try {
        const userDoc = await userData.findById(userId);
        if (userDoc && Array.isArray(userDoc.devices)) {
          const deviceIndex = userDoc.devices.findIndex(
            (d) => d.deviceId === deviceId
          );
          if (deviceIndex !== -1) {
            userDoc.devices.splice(deviceIndex, 1);
            await userDoc.save();
            // console.log(
            //   `Device ${deviceId} removed from user ${userId}'s devices`
            // );
          }
        }
      } catch (err) {
        console.error(
          "Error removing device from userData during force-logout:",
          err
        );
      }
      // Clean up the device room
      deviceRooms.delete(deviceId);
      // }
    });

    socket.on("start-watching", async ({ userId, deviceId, movieId }) => {
      try {
        console.log("start-watching", userId, deviceId, movieId);
        // 1. Get user plan and allowed streams
        const user = await userData.findById(userId);     
        if (!user) {
          socket.emit("stream-limit-reached", {
            message: "User not found",
          });
          return;
        }
        const plan = user.plan; // e.g., "Standard"
        const allowedStreams = await getAllowedStreamsForPlan(plan); // e.g., 2
        console.log(
          "allowedStreams =-=-=-=-=-=-=--",
          user.activeStreams,
          allowedStreams
        );

        const existingStream = user.activeStreams.find(
          (stream) => stream.deviceId === deviceId
        );
        console.log("existingStream", existingStream);
        if (existingStream) {
          // Device is already watching, allow it
          socket.emit("stream-allowed", {
            message: "You can continue watching",
          });
          return;
        }
        // 2. Count active streams
        if (user.activeStreams.length >= allowedStreams) {
          // Optionally: kick the oldest stream
          // Or: Deny new stream
          const oldestStream = user.activeStreams[0];
          socket.emit("stream-limit-reached", {
            message: `You have reached the device limit (${allowedStreams} devices). Please stop watching on another device first.`,
            oldestDeviceId: oldestStream.deviceId,
            allowedStreams: allowedStreams,
            currentStreams: user.activeStreams.length,
          });
          return;
        }

        // 3. Add this device to activeStreams
        user.activeStreams.push({
          deviceId,
          startedAt: new Date(),
          movieId: movieId || null,
        });
        await user.save();

        // 4. Allow playback
        socket.emit("stream-allowed", {
          message: "You can watch now",
          allowedStreams: allowedStreams,
          currentStreams: user.activeStreams.length,
        });

        // 6. Notify all user's devices about the update
        if (userDeviceSockets[userId]) {
          Object.keys(userDeviceSockets[userId]).forEach((deviceId) => {
            global.io
              .to(userDeviceSockets[userId][deviceId])
              .emit("devices-updated-watchlist", {
                userId,
                deviceId,
                allowedStreams,
                currentStreams: user.activeStreams.length,
              });
          });
        }
      } catch (error) {
        console.error("Error in start-watching:", error);
        socket.emit("stream-limit-reached", {
          message: "An error occurred while checking device limits",
        });
      }
    });

    socket.on("stop-watching", async ({ userId, deviceId }) => {
      try {
        const user = await userData.findById(userId);
        if (!user) return;

        // Remove this device from activeStreams
        user.activeStreams = user.activeStreams.filter(
          (s) => s.deviceId !== deviceId
        );
        await user.save();

        // Notify all user's devices about the update
        let allowedStreams;
        try {
          allowedStreams = await getAllowedStreamsForPlan(user.plan);
        } catch (e) {
          allowedStreams = 1; // fallback or handle error as needed
        }
        if (userDeviceSockets[userId]) {
          Object.keys(userDeviceSockets[userId]).forEach((devId) => {
            global.io
              .to(userDeviceSockets[userId][devId])
              .emit("devices-updated-watchlist", { 
                userId, 
                deviceId: devId,
                allowedStreams,
                currentStreams: user.activeStreams.length
              });
          });
        }

        socket.emit("stream-stopped", { message: "Stream stopped successfully" });
      } catch (error) {
        console.error("Error in stop-watching:", error);
      }
    });

    // 5. Handle disconnect
    socket.on("disconnect", (reason) => {
      const { userId, deviceId } = socket;
      if (userId && deviceId && userDeviceSockets[userId]) {
        delete userDeviceSockets[userId][deviceId];
        if (Object.keys(userDeviceSockets[userId]).length === 0) {
          delete userDeviceSockets[userId];
        }
      }
      if (deviceId) {
        deviceRooms.delete(deviceId);
      }
    });

    socket.on("update-continue-watching", async (data) => {

      console.log("update-continue-watching",data,"update-continue-watching");
      
      try {
        // You need to get userId from the socket (set during login)
        const userId = socket.userId;
        if (!userId) return;

        // Call your controller logic directly
        const req = {
          user: { _id: userId },
          body: {...data,userId:userId},
        };
        // Mock res object to send data back via socket
        const res = {
          status: (code) => ({
            json: (payload) => {
              socket.emit("continue-watching-updated", { code, payload });
            },
          }),
        };
        await addOrUpdateContinueWatching(req, res);
      } catch (err) {
        socket.emit("continue-watching-updated", {
          code: 500,
          payload: { error: err.message },
        });
      }
    });
  });
}

module.exports = {
  emitProgress,
  emitProgressToUser,
  emitProgressToDevice,
  handleSocketEvents,
  getSocketIdForDevice,
};

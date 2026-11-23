import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import "dotenv/config";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import dns from "dns";
import { userModel, messageModel } from "./model.js";
import { Server as socketIo } from "socket.io";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import authApis from "./apis/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fix Node.js Windows SRV lookup issue with MongoDB Atlas
try {
    dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
} catch (e) {
    console.warn("Could not set custom DNS servers:", e.message);
}

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET = process.env.JWT_SECRET || "default_jwt_secret_chat_app";

const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
];

if (process.env.CLIENT_URL) {
    allowedOrigins.push(process.env.CLIENT_URL);
}

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            return callback(null, true);
        },
        credentials: true,
    })
);

app.use(express.json());
app.use(cookieParser());

// Connect MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
    mongoose
        .connect(MONGODB_URI)
        .then(() => console.log("Mongoose is connected successfully"))
        .catch((err) => console.error("Mongoose connection error:", err.message));
} else {
    console.warn("MONGODB_URI is not defined in .env");
}

// Public Auth APIs (login, signup, logout)
app.use("/api/v1", authApis);

// Authentication & Authorization Middleware for protected API endpoints
app.use("/api/v1", (req, res, next) => {
    const authHeader = req.headers?.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const token = req.cookies?.Token || bearerToken;

    if (!token) {
        return res.status(401).send({ status: "error", message: "Unauthorized: No token provided" });
    }

    jwt.verify(token, SECRET, (err, decodedData) => {
        if (err) {
            return res.status(401).send({ status: "error", message: "Unauthorized: Invalid or expired token" });
        }
        const userData = { ...decodedData };
        delete userData.iat;
        delete userData.exp;
        req.user = userData;
        next();
    });
});

// Protected routes
app.get("/api/v1/me", (req, res) => {
    res.send({ status: "success", user: req.user });
});

// Get all users except current logged-in user
app.get("/api/v1/users", async (req, res) => {
    try {
        const currentUserId = req.user._id;
        const users = await userModel.find({ _id: { $ne: currentUserId } }, "firstName lastName email createdOn");
        res.send({ status: "success", users });
    } catch (error) {
        console.error("Fetch users error:", error);
        res.status(500).send({ status: "error", message: "Internal Server Error" });
    }
});

app.get("/api/v1/user-detail/:id", async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).send({ status: "error", message: "Invalid user ID" });
        }
        const user = await userModel.findById(req.params.id, "firstName lastName email createdOn");
        if (!user) {
            return res.status(404).send({ status: "error", message: "User not found" });
        }
        res.send({ status: "success", user });
    } catch (error) {
        console.error("Fetch user detail error:", error);
        res.status(500).send({ status: "error", message: "Internal Server Error" });
    }
});

// Send message via REST API
app.post("/api/v1/chat/:id", async (req, res) => {
    const receiverId = req.params.id;
    const senderId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
        return res.status(400).send({ status: "error", message: "Invalid receiver ID" });
    }

    if (!req.body?.message || !req.body.message.trim()) {
        return res.status(400).send({ status: "error", message: "Message field is required" });
    }

    try {
        const newMsg = await messageModel.create({
            from: senderId,
            to: receiverId,
            message: req.body.message.trim(),
        });

        const conversation = await messageModel
            .findById(newMsg._id)
            .populate({ path: "from", select: "firstName lastName email" })
            .populate({ path: "to", select: "firstName lastName email" })
            .exec();

        io.to(`user_${receiverId}`).emit("new_message", conversation);
        io.to(`user_${senderId}`).emit("new_message", conversation);

        const roomId = [senderId.toString(), receiverId.toString()].sort().join("_");
        io.to(`room_${roomId}`).emit("message", conversation);

        res.send({ status: "success", message: "Message Sent", chat: conversation });
    } catch (error) {
        console.error("Send message error:", error);
        res.status(500).send({ status: "error", message: "Internal Server Error" });
    }
});

// Get conversation messages between two users
app.get("/api/v1/conversation/:id", async (req, res) => {
    const receiverId = req.params.id;
    const senderId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
        return res.status(400).send({ status: "error", message: "Invalid user ID" });
    }

    try {
        const conversations = await messageModel
            .find({
                $or: [
                    { from: receiverId, to: senderId },
                    { from: senderId, to: receiverId },
                ],
            })
            .populate({ path: "from", select: "firstName lastName email" })
            .populate({ path: "to", select: "firstName lastName email" })
            .sort({ createdOn: 1 })
            .exec();

        res.send({ status: "success", message: "Messages Found", conversations });
    } catch (error) {
        console.error("Get conversation error:", error);
        res.status(500).send({ status: "error", message: "Internal Server Error" });
    }
});

const server = createServer(app);

const io = new socketIo(server, {
    cors: {
        origin: (origin, callback) => callback(null, true),
        credentials: true,
    },
});

const onlineUsers = new Map();

function extractCookieToken(cookieHeader) {
    if (!cookieHeader) return null;
    const match = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("Token="));
    if (!match) return null;
    return decodeURIComponent(match.slice("Token=".length));
}

io.use((socket, next) => {
    const token = socket.handshake.auth?.token || extractCookieToken(socket.handshake.headers?.cookie);

    if (!token) {
        return next();
    }

    jwt.verify(token, SECRET, (err, decoded) => {
        if (!err && decoded) {
            socket.user = decoded;
        }
        next();
    });
});

io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    if (socket.user?._id) {
        const userId = socket.user._id.toString();
        onlineUsers.set(userId, socket.id);
        socket.join(`user_${userId}`);
        io.emit("user_status", { userId, status: "online", onlineUsers: Array.from(onlineUsers.keys()) });
    }

    socket.on("join_user", (userId) => {
        if (!userId) return;
        const uid = userId.toString();
        onlineUsers.set(uid, socket.id);
        socket.join(`user_${uid}`);
        io.emit("user_status", { userId: uid, status: "online", onlineUsers: Array.from(onlineUsers.keys()) });
    });

    socket.on("join_chat", ({ senderId, receiverId }) => {
        if (!senderId || !receiverId) return;
        const roomId = [senderId.toString(), receiverId.toString()].sort().join("_");
        socket.join(`room_${roomId}`);
    });

    socket.on("typing", ({ senderId, receiverId, isTyping }) => {
        if (!receiverId) return;
        io.to(`user_${receiverId}`).emit("typing_status", { senderId, isTyping });
    });

    socket.on("send_message", async ({ senderId, receiverId, message }, callback) => {
        try {
            if (!senderId || !receiverId || !message?.trim()) return;
            if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
                if (typeof callback === "function") {
                    callback({ status: "error", message: "Invalid sender or receiver ID" });
                }
                return;
            }

            const newMsg = await messageModel.create({
                from: senderId,
                to: receiverId,
                message: message.trim(),
            });

            const conversation = await messageModel
                .findById(newMsg._id)
                .populate({ path: "from", select: "firstName lastName email" })
                .populate({ path: "to", select: "firstName lastName email" })
                .exec();

            io.to(`user_${receiverId}`).emit("new_message", conversation);
            io.to(`user_${senderId}`).emit("new_message", conversation);

            const roomId = [senderId.toString(), receiverId.toString()].sort().join("_");
            io.to(`room_${roomId}`).emit("message", conversation);

            if (typeof callback === "function") {
                callback({ status: "success", data: conversation });
            }
        } catch (err) {
            console.error("Socket send_message error:", err);
            if (typeof callback === "function") {
                callback({ status: "error", message: err.message });
            }
        }
    });

    socket.on("disconnect", () => {
        for (const [uid, sid] of onlineUsers.entries()) {
            if (sid === socket.id) {
                onlineUsers.delete(uid);
                io.emit("user_status", { userId: uid, status: "offline", onlineUsers: Array.from(onlineUsers.keys()) });
                break;
            }
        }
        console.log("Client disconnected:", socket.id);
    });
});

const frontendDist = path.join(__dirname, "web", "dist");
app.use(express.static(frontendDist));
app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(frontendDist, "index.html"), (err) => {
        if (err) next();
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
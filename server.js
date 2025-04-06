const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const compiler = require("compilex");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

const options = { stats: true };
compiler.init(options);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

const rooms = new Map(); // Map to store room ID -> { users, code, creator }

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/compile", function (req, res) {
    // Your existing compile endpoint logic (unchanged)
    var code = req.body.code;
    var input = req.body.input;
    var lang = req.body.lang;
    var envData = { OS: "windows", cmd: "g++", options: { timeout: 10000 } };

    try {
        if (lang === "cpp") {
            if (!input) {
                compiler.compileCPP(envData, code, function (data) {
                    res.send({ output: data.output ? data.output.replace(/\r\n/g, "\n") : "error" });
                });
            } else {
                compiler.compileCPPWithInput(envData, code, input, function (data) {
                    res.send({ output: data.output ? data.output.replace(/\r\n/g, "\n") : "error" });
                });
            }
        } else if (lang === "java") {
            var envData = { OS: "windows" };
            if (!input) {
                compiler.compileJava(envData, code, function (data) {
                    res.send({ output: data.output ? data.output.replace(/\r\n/g, "\n") : "error" });
                });
            } else {
                compiler.compileJavaWithInput(envData, code, input, function (data) {
                    res.send({ output: data.output ? data.output.replace(/\r\n/g, "\n") : "error" });
                });
            }
        } else if (lang === "py") {
            var envData = { OS: "windows" };
            if (!input) {
                compiler.compilePython(envData, code, function (data) {
                    res.send({ output: data.output ? data.output.replace(/\r\n/g, "\n") : "error" });
                });
            } else {
                compiler.compilePythonWithInput(envData, code, input, function (data) {
                    res.send({ output: data.output ? data.output.replace(/\r\n/g, "\n") : "error" });
                });
            }
        }

        setTimeout(() => {
            compiler.flush(() => console.log("Temporary files deleted."));
        }, 10000);
    } catch (e) {
        console.error("Compilation Error:", e);
        res.status(500).send({ output: "Server Compilation Error", error: e.toString() });
    }
});

io.on("connection", (socket) => {
    console.log("New user connected:", socket.id);

    socket.on("createRoom", () => {
        const roomId = socket.id;
        rooms.set(roomId, {
            users: [socket.id],
            code: { html: "", css: "", js: "" },
            creator: socket.id // Track the creator
        });
        socket.join(roomId);
        socket.emit("roomCreated", { roomId, isCreator: true });
        console.log(`Room created: ${roomId} by ${socket.id}`);
    });

    socket.on("joinRoom", (roomId) => {
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            room.users.push(socket.id);
            socket.join(roomId);
            socket.emit("joinedRoom", {
                roomId,
                code: room.code,
                isCreator: false // Joining user is not the creator
            });
            io.to(roomId).emit("userJoined", { userId: socket.id });
            console.log(`${socket.id} joined room: ${roomId}`);
        } else {
            socket.emit("error", "Room does not exist!");
        }
    });

    socket.on("rejoinRoom", (roomId) => {
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            if (!room.users.includes(socket.id)) {
                room.users.push(socket.id);
            }
            socket.join(roomId);
            socket.emit("joinedRoom", {
                roomId,
                code: room.code,
                isCreator: room.creator === socket.id
            });
            io.to(roomId).emit("userJoined", { userId: socket.id });
            console.log(`${socket.id} rejoined room: ${roomId}`);
        } else {
            socket.emit("error", "Room no longer exists!");
        }
    });

    socket.on("codeUpdate", ({ roomId, type, value }) => {
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            room.code[type] = value;
            socket.to(roomId).emit("codeUpdated", { type, value });
        }
    });

    // Room creator deletes the room
    socket.on("deleteRoom", (roomId) => {
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            if (room.creator === socket.id) {
                io.to(roomId).emit("roomDeleted"); // Notify all users
                rooms.delete(roomId);
                console.log(`Room ${roomId} deleted by creator ${socket.id}`);
            } else {
                socket.emit("error", "Only the creator can delete the room!");
            }
        }
    });

    // User disconnects from the room
    socket.on("leaveRoom", (roomId) => {
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            const index = room.users.indexOf(socket.id);
            if (index !== -1) {
                room.users.splice(index, 1);
                socket.leave(roomId);
                io.to(roomId).emit("userLeft", { userId: socket.id });
                socket.emit("leftRoom"); // Confirm to the user
                console.log(`${socket.id} left room: ${roomId}`);
                if (room.users.length === 0) {
                    rooms.delete(roomId);
                    console.log(`Room ${roomId} deleted (no users left)`);
                }
            }
        }
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
        rooms.forEach((room, roomId) => {
            const index = room.users.indexOf(socket.id);
            if (index !== -1) {
                room.users.splice(index, 1);
                io.to(roomId).emit("userLeft", { userId: socket.id });
                if (room.users.length === 0) {
                    rooms.delete(roomId);
                    console.log(`Room ${roomId} deleted (no users left)`);
                }
            }
        });
    });
});

const PORT = 5578;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
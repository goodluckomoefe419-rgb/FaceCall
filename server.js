const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const publicPath = path.join(__dirname, "PUBLIC");

app.use(express.static(publicPath));

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
});

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", (roomId) => {
        const room = String(roomId || "").trim().toUpperCase();
        if (!room) return;

        const roomMembers = io.sockets.adapter.rooms.get(room);
        const memberCount = roomMembers ? roomMembers.size : 0;

        if (memberCount >= 2) {
            socket.emit("room-full");
            return;
        }

        socket.join(room);
        socket.data.roomId = room;

        if (memberCount === 0) {
            socket.emit("room-created");
        } else {
            const existingUser = [...roomMembers][0];
            socket.emit("waiting-for-peer");
            io.to(existingUser).emit("user-joined", socket.id);
        }
    });

    socket.on("offer", ({ target, offer }) => {
        if (target && offer) {
            io.to(target).emit("offer", { from: socket.id, offer });
        }
    });

    socket.on("answer", ({ target, answer }) => {
        if (target && answer) {
            io.to(target).emit("answer", { from: socket.id, answer });
        }
    });

    socket.on("ice-candidate", ({ target, candidate }) => {
        if (target && candidate) {
            io.to(target).emit("ice-candidate", {
                from: socket.id,
                candidate
            });
        }
    });

    socket.on("leave-room", (roomId) => {
        const room = String(roomId || socket.data.roomId || "").trim().toUpperCase();
        if (!room) return;
        socket.leave(room);
        socket.data.roomId = null;
        socket.to(room).emit("user-left", socket.id);
    });

    socket.on("disconnect", () => {
        const room = socket.data.roomId;
        if (room) {
            socket.to(room).emit("user-left", socket.id);
        }
        console.log("User disconnected:", socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`FaceCall server running at http://localhost:${PORT}`);
});

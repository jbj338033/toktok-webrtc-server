import express from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://toktok-web.mcv.kr", "http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ['websocket', 'polling']
});

app.use(cors());

interface Room {
  users: string[];
}

const waitingQueue: Socket[] = [];
const activeRooms = new Map<string, Room>();

function createRoom(user1: string, user2: string): string {
  const roomId = uuidv4(); // UUID로 고유한 roomId 생성
  activeRooms.set(roomId, { users: [user1, user2] });
  return roomId;
}

function findMatch(socket: Socket): void {
  const isAlreadyInQueue = waitingQueue.some((s) => s.id === socket.id);
  if (!isAlreadyInQueue) {
    if (waitingQueue.length > 0) {
      const partner = waitingQueue.shift();
      if (partner) {
        const roomId = createRoom(socket.id, partner.id);
        socket.join(roomId);
        partner.join(roomId);
        io.to(roomId).emit("matched", { roomId });
      }
    } else {
      waitingQueue.push(socket);
    }
  }
}

io.on("connection", (socket: Socket) => {
  console.log("New client connected");

  socket.on("joinQueue", () => {
    findMatch(socket);
  });

  socket.on("leaveQueue", () => {
    const index = waitingQueue.findIndex((s) => s.id === socket.id);
    if (index !== -1) {
      waitingQueue.splice(index, 1);
    }
  });

  socket.on("offer", ({ offer, roomId }) => {
    try {
      console.log(`Emit Offer offer: ${offer}, roomId: ${roomId}`);
      socket.to(roomId).emit("offer", { offer, from: socket.id });
    } catch (error) {
      console.error(`Error handling offer for room ${roomId}:`, error);
    }
  });

  socket.on("answer", ({ answer, roomId }) => {
    try {
      console.log(`Emit Answer answer: ${answer}, roomId: ${roomId}`);
      socket.to(roomId).emit("answer", { answer, from: socket.id });
    } catch (error) {
      console.error(`Error handling answer for room ${roomId}:`, error);
    }
  });

  socket.on("iceCandidate", ({ candidate, roomId }) => {
    try {
      console.log(`Emit Candidate candidate: ${candidate}, roomId: ${roomId}`);
      socket.to(roomId).emit("iceCandidate", { candidate, from: socket.id });
    } catch (error) {
      console.error(`Error handling ICE candidate for room ${roomId}:`, error);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");

    // 대기열에서 사용자 제거
    const waitingIndex = waitingQueue.findIndex((s) => s.id === socket.id);
    if (waitingIndex !== -1) {
      waitingQueue.splice(waitingIndex, 1);
    }

    // 방에서 사용자 제거
    activeRooms.forEach((room, roomId) => {
      if (room.users.includes(socket.id)) {
        const remainingUser = room.users.find((user) => user !== socket.id);
        if (remainingUser) {
          io.to(roomId).emit("partnerDisconnected");
        }
        activeRooms.delete(roomId); // 방 삭제
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

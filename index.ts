import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "https://toktok-web.mcv.kr",
      "http://localhost:5173"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());

interface Room {
  users: string[];
}

const waitingQueue: Socket[] = [];
const activeRooms = new Map<string, Room>();

function createRoom(user1: string, user2: string): string {
  const roomId = Math.random().toString(36).substring(7);
  activeRooms.set(roomId, { users: [user1, user2] });
  return roomId;
}

function findMatch(socket: Socket): void {
  if (waitingQueue.length > 0) {
    // 랜덤성 추가: 50% 확률로 매칭
    if (Math.random() < 0.5) {
      const partner = waitingQueue.shift();
      if (partner) {
        const roomId = createRoom(socket.id, partner.id);
        socket.join(roomId);
        partner.join(roomId);
        io.to(roomId).emit('matched', { roomId });
      }
    } else {
      waitingQueue.push(socket);
    }
  } else {
    waitingQueue.push(socket);
  }
}

io.on('connection', (socket: Socket) => {
  console.log('New client connected');

  socket.on('joinQueue', () => {
    findMatch(socket);
  });

  socket.on('leaveQueue', () => {
    const index = waitingQueue.findIndex(s => s.id === socket.id);
    if (index !== -1) {
      waitingQueue.splice(index, 1);
    }
  });

  socket.on('offer', ({ offer, roomId }) => {
    socket.to(roomId).emit('offer', { offer, from: socket.id });
  });

  socket.on('answer', ({ answer, roomId }) => {
    socket.to(roomId).emit('answer', { answer, from: socket.id });
  });

  socket.on('iceCandidate', ({ candidate, roomId }) => {
    socket.to(roomId).emit('iceCandidate', { candidate, from: socket.id });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    const index = waitingQueue.findIndex(s => s.id === socket.id);
    if (index !== -1) {
      waitingQueue.splice(index, 1);
    }
    activeRooms.forEach((room, roomId) => {
      if (room.users.includes(socket.id)) {
        io.to(roomId).emit('partnerDisconnected');
        activeRooms.delete(roomId);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// 대기 중인 사용자를 저장할 큐
let waitingUsers: string[] = [];

// 연결된 소켓들을 저장할 객체
const connectedPeers: { [key: string]: string } = {};

interface MatchedData {
  room: string;
  isInitiator: boolean;
}

interface SignalData {
  room: string;
  signal: any;
}

io.on('connection', (socket: Socket) => {
  console.log('New user connected:', socket.id);

  // 사용자가 채팅방 참여를 요청할 때
  socket.on('join', () => {
    console.log('User requested to join:', socket.id);
    if (waitingUsers.length > 0) {
      // 대기 중인 사용자가 있으면 매칭
      const peer = waitingUsers.shift()!;
      const room = `${socket.id}#${peer}`;
      
      console.log(`Matching users: ${socket.id} and ${peer}`);
      
      socket.join(room);
      io.sockets.sockets.get(peer)?.join(room);

      // 두 사용자에게 매칭 완료 알림
      socket.emit('matched', { room, isInitiator: true } as MatchedData);
      io.to(peer).emit('matched', { room, isInitiator: false } as MatchedData);

      connectedPeers[socket.id] = peer;
      connectedPeers[peer] = socket.id;
    } else {
      // 대기 중인 사용자가 없으면 대기열에 추가
      console.log('Adding user to waiting queue:', socket.id);
      waitingUsers.push(socket.id);
    }
  });

  // WebRTC 시그널링
  socket.on('signal', (data: SignalData) => {
    console.log('Signal received from', socket.id, 'for room', data.room);
    if (data.signal.sdp) {
      console.log('SDP signal type:', data.signal.sdp.type);
    } else if (data.signal.ice) {
      console.log('ICE candidate received');
    }
    socket.to(data.room).emit('signal', data.signal);
  });

  // 사용자 연결 해제 시
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // 대기열에서 제거
    const index = waitingUsers.indexOf(socket.id);
    if (index > -1) {
      waitingUsers.splice(index, 1);
    }

    // 연결된 피어가 있으면 알림
    const peer = connectedPeers[socket.id];
    if (peer) {
      console.log('Notifying peer of disconnection:', peer);
      io.to(peer).emit('peerDisconnected');
      delete connectedPeers[peer];
    }

    delete connectedPeers[socket.id];
  });
});

// 정적 파일 서빙 (클라이언트 코드를 위해)
app.use(express.static('public'));

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
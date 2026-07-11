import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './RoomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// In production, we would serve static files from client/dist
// app.use(express.static(path.join(__dirname, '../client/dist')));

// Configure Socket.io with CORS for dev environment
const io = new Server(server, {
  cors: {
    origin: "*", // allow all in dev
    methods: ["GET", "POST"]
  }
});

const roomManager = new RoomManager(io);

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create room
  socket.on('create-room', (data, callback) => {
    try {
      const room = roomManager.createRoom();
      room.joinPlayer(socket, data.nickname || "Player 1");
      
      if (data.vsComputer) {
        room.joinBot();
      }
      
      if(callback) callback({ success: true, roomId: room.id });
    } catch (err) {
      if(callback) callback({ success: false, message: err.message });
    }
  });

  // Join room
  socket.on('join-room', (data, callback) => {
    try {
      const room = roomManager.getRoom(data.roomId);
      if (!room) {
        return callback && callback({ success: false, message: 'Room not found' });
      }
      room.joinPlayer(socket, data.nickname || "Player 2");
      
      if(callback) callback({ success: true, roomId: room.id });
    } catch (err) {
      if(callback) callback({ success: false, message: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    roomManager.handleDisconnect(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

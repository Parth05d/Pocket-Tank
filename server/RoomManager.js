import { Room } from './Room.js';

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    
    // Cleanup interval (every 1 minute)
    setInterval(() => this.cleanupRooms(), 60 * 1000);
  }

  generateRoomId() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  }

  createRoom() {
    let roomId = this.generateRoomId();
    while (this.rooms.has(roomId)) {
      roomId = this.generateRoomId();
    }
    const room = new Room(roomId, this.io);
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  handleDisconnect(socketId) {
    // Find the room the user is in and notify it
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.hasPlayer(socketId)) {
        room.handlePlayerDisconnect(socketId);
      }
    }
  }

  cleanupRooms() {
    const now = Date.now();
    for (const [roomId, room] of this.rooms.entries()) {
      // Cleanup if empty, or if inactive for 10 minutes and not in progress
      if (room.isEmpty() || 
         (now - room.lastActivityAt > 10 * 60 * 1000 && room.status !== 'in-progress')) {
        room.destroy();
        this.rooms.delete(roomId);
        console.log(`Cleaned up room ${roomId}`);
      }
    }
  }
}

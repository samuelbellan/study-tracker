const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Store active users/friends
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // User joins and identifies themselves
  socket.on('user_join', (username) => {
    activeUsers.set(socket.id, { username, isStudying: false });
    io.emit('users_update', Array.from(activeUsers.values()));
    console.log(`${username} joined. Active users:`, Array.from(activeUsers.values()));
  });

  // User starts studying
  socket.on('start_study', (username) => {
    console.log(`${username} started studying!`);
    const user = activeUsers.get(socket.id);
    if (user) {
      user.isStudying = true;
      activeUsers.set(socket.id, user);
    }
    
    // Broadcast to all OTHER friends that this user started studying
    socket.broadcast.emit('friend_started_studying', username);
    io.emit('users_update', Array.from(activeUsers.values()));
  });

  // User stops studying
  socket.on('stop_study', (username) => {
    console.log(`${username} stopped studying.`);
    const user = activeUsers.get(socket.id);
    if (user) {
      user.isStudying = false;
      activeUsers.set(socket.id, user);
    }
    io.emit('users_update', Array.from(activeUsers.values()));
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    activeUsers.delete(socket.id);
    io.emit('users_update', Array.from(activeUsers.values()));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Study Tracker Backend running on port ${PORT}`);
});

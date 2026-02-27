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

// Store: socketId -> { username, isStudying, subject, studyStartTime, stats, todaySeconds }
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('user_join', (username) => {
    activeUsers.set(socket.id, {
      username,
      isStudying: false,
      subject: '',
      studyStartTime: null,
      stats: null,
      todaySeconds: 0
    });
    broadcastUsers();
    console.log(`${username} joined.`);
  });

  function broadcastUsers() {
    const now = Date.now();
    const users = Array.from(activeUsers.values()).map(u => ({
      ...u,
      studyElapsed: u.isStudying && u.studyStartTime ? Math.floor((now - u.studyStartTime) / 1000) : 0
    }));
    io.emit('users_update', users);
  }

  socket.on('start_study', (data) => {
    const user = activeUsers.get(socket.id);
    if (user) {
      user.isStudying = true;
      if (typeof data === 'object') {
        user.subject = data.subject || '';
        // Use client timestamp if provided, otherwise server time
        user.studyStartTime = data.startTime || Date.now();
      } else {
        user.studyStartTime = Date.now();
      }
      activeUsers.set(socket.id, user);
    }
    const name = typeof data === 'object' ? data.username : data;
    socket.broadcast.emit('friend_started_studying', name);
    broadcastUsers();
    console.log(`${name} started studying (${user?.subject})`);
  });

  socket.on('stop_study', (username) => {
    const user = activeUsers.get(socket.id);
    if (user) {
      user.isStudying = false;
      user.subject = '';
      user.studyStartTime = null;
      activeUsers.set(socket.id, user);
    }
    broadcastUsers();
  });

  socket.on('update_stats', (stats) => {
    const user = activeUsers.get(socket.id);
    if (user) {
      user.stats = stats;
      user.todaySeconds = stats.todaySeconds || 0;
      activeUsers.set(socket.id, user);
      broadcastUsers();
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    activeUsers.delete(socket.id);
    broadcastUsers();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Study Tracker Backend running on port ${PORT}`);
});

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

// Store: socketId -> { username, isStudying, studyType, subject, stats }
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('user_join', (username) => {
    activeUsers.set(socket.id, {
      username,
      isStudying: false,
      studyType: '',    // 'teoria' ou 'questoes'
      subject: '',
      stats: null       // resumo das stats do usuário
    });
    io.emit('users_update', Array.from(activeUsers.values()));
    console.log(`${username} joined.`);
  });

  // Começa a estudar com tipo e matéria
  socket.on('start_study', (data) => {
    // data = { username, studyType, subject } OU apenas username (retrocompat)
    const user = activeUsers.get(socket.id);
    if (user) {
      user.isStudying = true;
      if (typeof data === 'object') {
        user.studyType = data.studyType || '';
        user.subject = data.subject || '';
      }
      activeUsers.set(socket.id, user);
    }
    const name = typeof data === 'object' ? data.username : data;
    socket.broadcast.emit('friend_started_studying', name);
    io.emit('users_update', Array.from(activeUsers.values()));
    console.log(`${name} started studying (${user?.studyType} - ${user?.subject})`);
  });

  // Para de estudar
  socket.on('stop_study', (username) => {
    const user = activeUsers.get(socket.id);
    if (user) {
      user.isStudying = false;
      user.studyType = '';
      user.subject = '';
      activeUsers.set(socket.id, user);
    }
    io.emit('users_update', Array.from(activeUsers.values()));
  });

  // Atualiza stats do usuário (resumo para amigos verem)
  socket.on('update_stats', (stats) => {
    const user = activeUsers.get(socket.id);
    if (user) {
      user.stats = stats;
      activeUsers.set(socket.id, user);
      io.emit('users_update', Array.from(activeUsers.values()));
    }
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

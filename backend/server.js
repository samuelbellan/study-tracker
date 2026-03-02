require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { User, Session, connectDB } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
});

// ==============================
// REST API
// ==============================

// --- Auth (login/register by username) ---
app.post('/api/auth', async (req, res) => {
  try {
    const { username } = req.body;
    console.log(`[Auth API] Login attempt for username: '${username}'`);
    if (!username || !username.trim()) return res.status(400).json({ error: 'Username required' });
    let user = await User.findOne({ username: username.trim() });
    if (!user) {
      console.log(`[Auth API] User '${username}' not found. Creating new user...`);
      user = await User.create({ username: username.trim() });
    }
    console.log(`[Auth API] Login successful for '${username}'. ID: ${user._id}`);
    res.json({ userId: user._id, username: user.username, subjects: user.subjects });
  } catch (err) {
    console.error(`[Auth API Error]`, err);
    res.status(500).json({ error: err.message });
  }
});

// --- Subjects ---
app.get('/api/subjects/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.subjects);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/subjects/:userId', async (req, res) => {
  try {
    const { action, name } = req.body; // action: 'add' | 'remove'
    console.log(`[Subject API] User ${req.params.userId} requested action '${action}' for subject '${name}'`);
    const user = await User.findById(req.params.userId);
    if (!user) {
      console.error(`[Subject API] User ${req.params.userId} not found`);
      return res.status(404).json({ error: 'User not found' });
    }
    if (action === 'add' && name && !user.subjects.includes(name.trim())) {
      user.subjects.push(name.trim());
      console.log(`[Subject API] Added subject '${name}' for User ${req.params.userId}`);
    } else if (action === 'remove') {
      user.subjects = user.subjects.filter(s => s !== name);
      console.log(`[Subject API] Removed subject '${name}' for User ${req.params.userId}`);
    }
    await user.save();
    res.json(user.subjects);
  } catch (err) {
    console.error(`[Subject API Error]`, err);
    res.status(500).json({ error: err.message });
  }
});

// --- Sessions CRUD ---
app.get('/api/sessions/:userId', async (req, res) => {
  try {
    const { start, end, subject } = req.query;
    const filter = { userId: req.params.userId };
    if (start || end) {
      filter.date = {};
      if (start) filter.date.$gte = new Date(start);
      if (end) filter.date.$lte = new Date(end + 'T23:59:59.999Z');
    }
    if (subject) filter.subject = subject;
    const sessions = await Session.find(filter).sort({ date: -1 }).lean();
    res.json(sessions);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { userId, subject, date, duration, startTime, endTime, manual, bulk } = req.body;
    if (!userId || !subject || !date || !duration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const session = await Session.create({
      userId, subject,
      date: new Date(date),
      duration,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      manual: manual || false,
      bulk: bulk || false
    });
    res.status(201).json(session);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk import (for migration from localStorage)
app.post('/api/sessions/bulk', async (req, res) => {
  try {
    const { userId, sessions } = req.body;
    if (!userId || !sessions || !sessions.length) {
      return res.status(400).json({ error: 'Missing userId or sessions' });
    }
    const docs = sessions.map(s => ({
      userId,
      subject: s.subject,
      date: new Date(s.date),
      duration: s.duration,
      startTime: s.startTime ? new Date(s.startTime) : undefined,
      endTime: s.endTime ? new Date(s.endTime) : undefined,
      manual: s.manual || false,
      bulk: s.bulk || false
    }));
    const result = await Session.insertMany(docs);
    res.status(201).json({ imported: result.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/sessions/:id', async (req, res) => {
  try {
    const updates = {};
    const { subject, date, duration, startTime, endTime } = req.body;
    if (subject !== undefined) updates.subject = subject;
    if (date !== undefined) updates.date = new Date(date);
    if (duration !== undefined) updates.duration = duration;
    if (startTime !== undefined) updates.startTime = new Date(startTime);
    if (endTime !== undefined) updates.endTime = new Date(endTime);
    const session = await Session.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const session = await Session.findByIdAndDelete(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/sessions/user/:userId', async (req, res) => {
  try {
    const result = await Session.deleteMany({ userId: req.params.userId });
    res.json({ deleted: result.deletedCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Stats ---
app.get('/api/stats/:userId', async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.params.userId }).lean();

    const totalSeconds = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);
    const totalHours = totalSeconds / 3600;

    const uniqueDays = new Set(sessions.map(s => s.date?.toISOString().split('T')[0]));
    const daysCount = uniqueDays.size || 1;
    const dailyAvgHours = totalHours / daysCount;

    const firstSession = sessions.length > 0 ? new Date(sessions[0].date) : new Date();
    const weeksDiff = Math.max(1, Math.ceil((new Date() - firstSession) / (7 * 24 * 3600 * 1000)));
    const weeklyAvgHours = totalHours / weeksDiff;

    // Per subject
    const subjectMap = {};
    sessions.forEach(s => {
      if (!subjectMap[s.subject]) subjectMap[s.subject] = { totalSeconds: 0, sessions: 0 };
      subjectMap[s.subject].totalSeconds += s.duration || 0;
      subjectMap[s.subject].sessions += 1;
    });

    // Last 7 days
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const dayLabel = d.toLocaleDateString('pt-BR', { weekday: 'short' });
      const daySessions = sessions.filter(s => s.date?.toISOString().startsWith(dayStr));
      const daySeconds = daySessions.reduce((acc, s) => acc + (s.duration || 0), 0);
      last7.push({ label: dayLabel, hours: daySeconds / 3600, date: dayStr });
    }

    // Today
    const todayStr = new Date().toISOString().split('T')[0];
    const todaySessions = sessions.filter(s => s.date?.toISOString().startsWith(todayStr));
    const todaySeconds = todaySessions.reduce((acc, s) => acc + (s.duration || 0), 0);

    res.json({ totalHours, totalSessions: sessions.length, dailyAvgHours, weeklyAvgHours, subjectMap, last7, todaySeconds });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==============================
// SOCKET.IO (real-time presence)
// ==============================

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

// ==============================
// START
// ==============================

async function start() {
  await connectDB();
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Study Tracker Backend running on port ${PORT}`);
  });
}

start();

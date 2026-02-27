import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Play, Square, Users, Clock, LogOut, Minimize2, X, Minus,
  BookOpen, BarChart3, Plus, Trash2, Eye, Pause, Calendar, ZoomIn, ZoomOut,
  CalendarDays, Search, Filter
} from 'lucide-react';
import './App.css';
import {
  getSubjects, addSubject, removeSubject,
  getSessions, saveSession, deleteSession, clearAllSessions, getStats, getStatsForRange
} from './StudyData';

const SOCKET_URL = 'https://study-tracker-2t7y.onrender.com';

const urlParams = new URLSearchParams(window.location.search);
const isMiniWindow = urlParams.get('mini') === 'true';
const miniUser = urlParams.get('user') || '';
const miniStudying = urlParams.get('studying') === 'true';
const miniIsMe = urlParams.get('me') === 'true';

function playMSNSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [830, 1046, 1318, 1046];
    const durations = [0.12, 0.12, 0.12, 0.2];
    let t = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + durations[i]);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + durations[i]); t += durations[i];
    });
  } catch (e) { /* */ }
}

const CustomTitleBar = () => {
  if (!window.electronAPI) return null;
  return (
    <div className="custom-title-bar">
      <div className="title-bar-drag-area">Study Tracker</div>
      <div className="title-bar-controls">
        <button onClick={() => window.electronAPI.windowControl('minimize')}><Minus size={14} /></button>
        <button onClick={() => window.electronAPI.windowControl('maximize')}><Square size={12} /></button>
        <button onClick={() => window.electronAPI.windowControl('close')} className="close-btn"><X size={14} /></button>
      </div>
    </div>
  );
};

function FloatingAvatar() {
  const [isStudying] = useState(miniStudying);
  const [hovering, setHovering] = useState(false);
  useEffect(() => {
    document.documentElement.classList.add('mini-mode');
    document.body.classList.add('mini-mode');
    document.getElementById('root')?.classList.add('mini-mode');
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);
  const exitMini = () => { if (window.electronAPI) window.electronAPI.exitMiniMode(); };
  return (
    <div className="solo-avatar-window">
      <div className="solo-drag-zone" />
      <div className={`solo-avatar-wrapper ${isStudying ? 'studying' : 'idle'}`}
        onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)} onDoubleClick={exitMini}>
        <div className="solo-avatar">{miniUser.charAt(0).toUpperCase()}</div>
        <div className={`solo-status-dot ${isStudying ? 'dot-studying' : 'dot-idle'}`} />
        {hovering && (
          <div className="solo-tooltip">
            <strong>{miniUser}</strong>
            <span className={`tooltip-status ${isStudying ? 'studying' : ''}`}>
              {isStudying ? '📖 Estudando' : '💤 Parado'}
            </span>
            {miniIsMe && <span className="tooltip-me">Você</span>}
          </div>
        )}
      </div>
    </div>
  );
}

const fmt = (t) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};
const fmtHours = (h) => h < 1 ? `${Math.round(h * 60)}min` : `${h.toFixed(1)}h`;
const todayISO = () => new Date().toISOString().split('T')[0];

// Desk + person studying SVG icon
function DeskIcon({ className }) {
  return (
    <svg className={className} width="40" height="40" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* desk */}
      <rect x="8" y="38" width="48" height="4" rx="2" fill="currentColor" opacity="0.9" />
      <rect x="12" y="42" width="4" height="14" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="48" y="42" width="4" height="14" rx="1" fill="currentColor" opacity="0.6" />
      {/* monitor */}
      <rect x="22" y="22" width="20" height="14" rx="2" fill="currentColor" opacity="0.7" />
      <rect x="30" y="36" width="4" height="3" rx="1" fill="currentColor" opacity="0.5" />
      {/* book on desk */}
      <rect x="14" y="33" width="10" height="5" rx="1" fill="currentColor" opacity="0.5" />
      {/* lamp */}
      <rect x="48" y="28" width="3" height="10" rx="1" fill="currentColor" opacity="0.4" />
      <circle cx="49.5" cy="26" r="4" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

// Subject color palette
const SUBJECT_COLORS = [
  '#3B82F6', '#EF4444', '#F59E0B', '#10B981', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#6366F1'
];
function getSubjectColor(subject, allSubjects) {
  const idx = allSubjects.indexOf(subject);
  return SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
}

// ===== DailyTimeline: calendar-like view of today's sessions =====
function DailyTimeline({ sessions, subjects, onResume, onBack, selectedSubject, totalTodaySeconds }) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Get today's sessions only
  const todaySessions = sessions.filter((s) => s.date?.startsWith(todayStr) && s.startTime && s.endTime);

  // Week calendar
  const weekDays = [];
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + mondayOffset + i);
    weekDays.push({
      label: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      day: d.getDate(),
      isToday: d.toISOString().split('T')[0] === todayStr
    });
  }

  // Timeline range: show from earliest session start to current hour + 1
  const currentHour = now.getHours();
  let minHour = currentHour;
  let maxHour = currentHour + 1;
  todaySessions.forEach((s) => {
    const startH = new Date(s.startTime).getHours();
    const endH = new Date(s.endTime).getHours() + 1;
    if (startH < minHour) minHour = startH;
    if (endH > maxHour) maxHour = endH;
  });
  minHour = Math.max(0, minHour - 1);
  maxHour = Math.min(24, maxHour + 1);
  const totalHours = maxHour - minHour;

  // Compute rest since last session
  let restSeconds = 0;
  if (todaySessions.length > 0) {
    const lastEnd = todaySessions.reduce((max, s) => {
      const e = new Date(s.endTime).getTime();
      return e > max ? e : max;
    }, 0);
    restSeconds = Math.floor((Date.now() - lastEnd) / 1000);
    if (restSeconds < 0) restSeconds = 0;
  }

  const fmtDur = (sec) => {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  return (
    <div className="timeline-container">
      {/* Week header */}
      <div className="timeline-week-header">
        {weekDays.map((d, i) => (
          <div key={i} className={`timeline-week-day ${d.isToday ? 'timeline-today' : ''}`}>
            <span className="timeline-day-label">{d.label}</span>
            <span className={`timeline-day-num ${d.isToday ? 'today-num' : ''}`}>{d.day}</span>
          </div>
        ))}
      </div>

      {/* Timeline body */}
      <div className="timeline-body">
        <div className="timeline-hours">
          {Array.from({ length: totalHours + 1 }, (_, i) => {
            const h = minHour + i;
            const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
            return (
              <div key={i} className="timeline-hour-mark" style={{ top: `${(i / totalHours) * 100}%` }}>
                <span className="timeline-hour-label">{label}</span>
                <div className="timeline-hour-line" />
              </div>
            );
          })}

          {/* Current time line */}
          {(() => {
            const nowMin = currentHour * 60 + now.getMinutes();
            const topPct = ((nowMin - minHour * 60) / (totalHours * 60)) * 100;
            if (topPct >= 0 && topPct <= 100) {
              return (
                <div className="timeline-now-line" style={{ top: `${topPct}%` }}>
                  <span className="timeline-now-time">
                    {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="timeline-now-rule" />
                </div>
              );
            }
            return null;
          })()}

          {/* Session blocks */}
          {todaySessions.map((s, i) => {
            const start = new Date(s.startTime);
            const end = new Date(s.endTime);
            const startMin = start.getHours() * 60 + start.getMinutes();
            const endMin = end.getHours() * 60 + end.getMinutes();
            const topPct = ((startMin - minHour * 60) / (totalHours * 60)) * 100;
            const heightPct = Math.max(((endMin - startMin) / (totalHours * 60)) * 100, 2);
            const color = getSubjectColor(s.subject, subjects);

            return (
              <div key={i} className="timeline-session-block" style={{
                top: `${topPct}%`, height: `${heightPct}%`,
                borderLeftColor: color
              }}>
                <div className="timeline-session-dot" style={{ background: color }} />
                <div className="timeline-session-info">
                  <span className="timeline-session-subject">{s.subject}</span>
                  <span className="timeline-session-dur">{fmtDur(s.duration)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="timeline-bottom-bar">
        <button className="timeline-back-btn" onClick={onBack} title="Voltar">
          <Clock size={18} />
        </button>
        <button className="timeline-play-btn" onClick={onResume} title="Retomar estudo">
          <Play size={20} fill="currentColor" />
        </button>
        <div className="timeline-bottom-info">
          <span className="timeline-total-time">{fmt(totalTodaySeconds)}</span>
          <span className="timeline-rest">Descanso {fmtDur(restSeconds)}</span>
        </div>
      </div>
    </div>
  );
}

// ===== LiveTimer: computes elapsed from a start timestamp =====
function LiveTimer({ startTime, initialElapsed }) {
  const [elapsed, setElapsed] = useState(initialElapsed || 0);
  useEffect(() => {
    // Use local clock-relative start time: Date.now() - initialElapsed*1000
    const localStart = startTime || (initialElapsed ? Date.now() - initialElapsed * 1000 : null);
    if (!localStart) return;
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - localStart) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startTime, initialElapsed]);
  return <span className="avatar-time">{fmt(elapsed)}</span>;
}

// ===== MODAL DE STATS DO AMIGO =====
function FriendStatsModal({ friend, onClose }) {
  const s = friend.stats;
  if (!s) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={16} /></button>
        <h3 className="modal-title">{friend.username}</h3>
        <p className="empty-state">Estatísticas não disponíveis.</p>
      </div>
    </div>
  );
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={16} /></button>
        <h3 className="modal-title">📊 {friend.username}</h3>
        <div className="modal-stats-cards">
          <div className="modal-stat"><div className="modal-stat-val">{fmtHours(s.totalHours || 0)}</div><div className="stat-label">Total</div></div>
          <div className="modal-stat"><div className="modal-stat-val">{s.totalSessions || 0}</div><div className="stat-label">Sessões</div></div>
          <div className="modal-stat"><div className="modal-stat-val">{fmtHours(s.dailyAvgHours || 0)}</div><div className="stat-label">Média/Dia</div></div>
          <div className="modal-stat"><div className="modal-stat-val">{fmtHours(s.weeklyAvgHours || 0)}</div><div className="stat-label">Média/Sem</div></div>
        </div>
        {s.subjectMap && Object.keys(s.subjectMap).length > 0 && (
          <div className="modal-section">
            <h4>Horas por Matéria</h4>
            {Object.entries(s.subjectMap).sort((a, b) => b[1].totalSeconds - a[1].totalSeconds).map(([subj, data], i) => (
              <div key={i} className="modal-subj-row">
                <span>{subj}</span>
                <span className="modal-subj-hours">{fmtHours(data.totalSeconds / 3600)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== APP PRINCIPAL =====
function App() {
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isStudying, setIsStudying] = useState(false);
  const [studyTime, setStudyTime] = useState(0);
  const [activeUsers, setActiveUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [inMiniMode, setInMiniMode] = useState(false);
  const [activeTab, setActiveTab] = useState('estudar');
  const [subjects, setSubjects] = useState(getSubjects());
  const [selectedSubject, setSelectedSubject] = useState('');
  const [showTimeline, setShowTimeline] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [stats, setStats] = useState(null);
  const [sessionHistory, setSessionHistory] = useState(getSessions());
  const [viewingFriend, setViewingFriend] = useState(null);
  const [manualSubject, setManualSubject] = useState('');
  const [manualHours, setManualHours] = useState('');
  const [manualMinutes, setManualMinutes] = useState('');
  const [manualDate, setManualDate] = useState(todayISO());
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySubjectFilter, setHistorySubjectFilter] = useState('all');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState(todayISO());
  const [rangeStats, setRangeStats] = useState(null);
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkHours, setBulkHours] = useState('');
  const [bulkMinutes, setBulkMinutes] = useState('');
  const [bulkStartDate, setBulkStartDate] = useState('');
  const [bulkEndDate, setBulkEndDate] = useState(todayISO());
  const [zoomLevel, setZoomLevel] = useState(() => {
    const saved = localStorage.getItem('studytracker_zoom');
    return saved ? parseFloat(saved) : 1.0;
  });
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const notifIdRef = useRef(0);

  const showMSNNotif = (message, type = 'online') => {
    const id = ++notifIdRef.current;
    setNotifications((prev) => [...prev, { id, message, type, leaving: false }]);
    playMSNSound();
    setTimeout(() => setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, leaving: true } : n)), 4000);
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 4500);
  };

  const createSocket = () => io(SOCKET_URL, { extraHeaders: { 'Bypass-Tunnel-Reminder': 'true' } });

  useEffect(() => {
    const s = createSocket();
    setSocket(s);
    s.on('users_update', (users) => {
      // Compute local-relative studyStartTime from server-sent elapsed
      const processedUsers = users.map(u => ({
        ...u,
        studyStartTime: u.isStudying && u.studyElapsed != null
          ? Date.now() - u.studyElapsed * 1000
          : u.studyStartTime
      }));
      setActiveUsers((prev) => {
        const prevNames = new Set(prev.map((u) => u.username));
        const newNames = new Set(processedUsers.map((u) => u.username));
        const me = localStorage.getItem('studytracker_username');
        processedUsers.forEach((u) => { if (!prevNames.has(u.username) && u.username !== me) showMSNNotif(`${u.username} ficou online`, 'online'); });
        prev.forEach((u) => { if (!newNames.has(u.username) && u.username !== me) showMSNNotif(`${u.username} ficou offline`, 'offline'); });
        processedUsers.forEach((u) => {
          const old = prev.find((p) => p.username === u.username);
          if (old && u.username !== me) {
            if (!old.isStudying && u.isStudying) {
              const detail = u.subject ? ` — ${u.subject}` : '';
              showMSNNotif(`${u.username} começou a estudar!${detail} 📖`, 'studying');
            } else if (old.isStudying && !u.isStudying) showMSNNotif(`${u.username} parou de estudar`, 'idle');
          }
        });
        return processedUsers;
      });
    });
    return () => s.close();
  }, []);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && isJoined && username) {
        if (!socket || socket.disconnected) {
          const s = createSocket();
          s.on('users_update', (users) => {
            const processedUsers = users.map(u => ({
              ...u,
              studyStartTime: u.isStudying && u.studyElapsed != null
                ? Date.now() - u.studyElapsed * 1000
                : u.studyStartTime
            }));
            setActiveUsers(processedUsers);
          });
          s.on('connect', () => {
            s.emit('user_join', username);
            s.emit('update_stats', getStats());
          });
          setSocket(s);
          setInMiniMode(false);
        }
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [socket, isJoined, username]);

  useEffect(() => {
    if (inMiniMode && window.electronAPI && activeUsers.length > 0) {
      const users = activeUsers.map((u) => ({ username: u.username, isStudying: u.isStudying, isMe: u.username === username }));
      window.electronAPI.syncMiniAvatars(users);
    }
  }, [activeUsers, inMiniMode, username]);

  useEffect(() => {
    if (isStudying) {
      timerRef.current = setInterval(() => setStudyTime((p) => p + 1), 1000);
    } else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [isStudying]);

  useEffect(() => {
    if (activeTab === 'estatisticas') setStats(getStats());
    if (activeTab === 'estudar') setSessionHistory(getSessions());
  }, [activeTab]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (username.trim() && socket) {
      socket.emit('user_join', username.trim());
      localStorage.setItem('studytracker_username', username.trim());
      setIsJoined(true);
      setTimeout(() => socket.emit('update_stats', getStats()), 1000);
    }
  };

  const toggleStudy = () => {
    if (!socket) return;
    if (isStudying) {
      socket.emit('stop_study', username);
      setIsStudying(false);
      if (startTimeRef.current && selectedSubject) {
        saveSession({
          subject: selectedSubject,
          date: new Date().toISOString(), duration: studyTime,
          startTime: startTimeRef.current, endTime: new Date().toISOString()
        });
        setSessionHistory(getSessions());
        socket.emit('update_stats', getStats());
      }
      setStudyTime(0);
      setShowTimeline(true);
    } else {
      if (!selectedSubject) { showMSNNotif('Selecione uma matéria primeiro!', 'idle'); return; }
      socket.emit('start_study', { username, subject: selectedSubject, startTime: Date.now() });
      setIsStudying(true);
      setShowTimeline(false);
      startTimeRef.current = new Date().toISOString();
    }
  };

  const handleAddSubject = (e) => {
    e.preventDefault();
    if (newSubject.trim()) { setSubjects(addSubject(newSubject.trim())); setNewSubject(''); }
  };
  const handleRemoveSubject = (name) => {
    setSubjects(removeSubject(name));
    if (selectedSubject === name) setSelectedSubject('');
  };

  const handleManualSession = (e) => {
    e.preventDefault();
    if (!manualSubject) return;
    const h = parseInt(manualHours) || 0;
    const m = parseInt(manualMinutes) || 0;
    const totalSec = h * 3600 + m * 60;
    if (totalSec <= 0) return;
    const sessionDate = manualDate ? new Date(manualDate + 'T12:00:00').toISOString() : new Date().toISOString();
    saveSession({
      subject: manualSubject,
      date: sessionDate, duration: totalSec,
      startTime: sessionDate, endTime: sessionDate, manual: true
    });
    setSessionHistory(getSessions());
    const dateLabel = manualDate !== todayISO() ? ` em ${new Date(manualDate + 'T12:00:00').toLocaleDateString('pt-BR')}` : '';
    showMSNNotif(`${h}h${m > 0 ? m + 'min' : ''} registradas em ${manualSubject}${dateLabel}`, 'studying');
    setManualHours(''); setManualMinutes(''); setManualDate(todayISO());
    if (socket) socket.emit('update_stats', getStats());
  };

  const handleRangeQuery = () => {
    if (!rangeStart || !rangeEnd) return;
    setRangeStats(getStatsForRange(rangeStart, rangeEnd));
  };

  const handleBulkHours = (e) => {
    e.preventDefault();
    if (!bulkSubject || !bulkStartDate || !bulkEndDate) return;
    const h = parseInt(bulkHours) || 0;
    const m = parseInt(bulkMinutes) || 0;
    const totalSec = h * 3600 + m * 60;
    if (totalSec <= 0) return;

    const start = new Date(bulkStartDate + 'T12:00:00');
    const end = new Date(bulkEndDate + 'T12:00:00');
    if (end < start) { showMSNNotif('Data final deve ser após a inicial', 'idle'); return; }

    // Calculate days in range
    const diffMs = end - start;
    const daysInRange = Math.max(1, Math.round(diffMs / (24 * 3600 * 1000)) + 1);
    const secPerDay = Math.floor(totalSec / daysInRange);
    const remainder = totalSec - secPerDay * daysInRange;

    // Create one session per day, distributing hours evenly
    for (let i = 0; i < daysInRange; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const daySec = secPerDay + (i === 0 ? remainder : 0);
      if (daySec <= 0) continue;
      saveSession({
        subject: bulkSubject,
        date: d.toISOString(),
        duration: daySec,
        startTime: d.toISOString(),
        endTime: d.toISOString(),
        manual: true,
        bulk: true
      });
    }
    setSessionHistory(getSessions());
    const startLabel = new Date(bulkStartDate + 'T12:00:00').toLocaleDateString('pt-BR');
    const endLabel = new Date(bulkEndDate + 'T12:00:00').toLocaleDateString('pt-BR');
    showMSNNotif(`${h}h${m > 0 ? m + 'min' : ''} distribuídas de ${startLabel} a ${endLabel}`, 'studying');
    setBulkHours(''); setBulkMinutes(''); setBulkStartDate(''); setBulkEndDate(todayISO());
    if (socket) socket.emit('update_stats', getStats());
  };

  const enterMiniMode = () => {
    if (window.electronAPI) {
      const users = activeUsers.map((u) => ({ username: u.username, isStudying: u.isStudying, isMe: u.username === username }));
      // Only add yourself if you're not already in the list
      const myUser = users.find(u => u.isMe);
      if (!myUser) {
        users.push({ username, isStudying, isMe: true });
      }
      setInMiniMode(true);
      window.electronAPI.enterMiniMode(users);
    }
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(zoomLevel + 0.1, 1.5);
    setZoomLevel(newZoom);
    localStorage.setItem('studytracker_zoom', newZoom.toString());
    document.getElementById('root').style.zoom = newZoom;
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoomLevel - 0.1, 0.7);
    setZoomLevel(newZoom);
    localStorage.setItem('studytracker_zoom', newZoom.toString());
    document.getElementById('root').style.zoom = newZoom;
  };

  useEffect(() => {
    document.getElementById('root').style.zoom = zoomLevel;
  }, []);

  // Derived data
  const studyingUsers = activeUsers.filter((u) => u.isStudying);
  const onlineFriends = activeUsers.filter((u) => u.username !== username);

  // Today's total from stats
  const todayTotal = stats?.todaySeconds || getStats().todaySeconds || 0;

  // Filtered session history
  const getFilteredSessions = () => {
    let filtered = [...sessionHistory];
    const now = new Date();
    if (historyFilter === 'today') {
      const t = todayISO();
      filtered = filtered.filter((s) => s.date?.startsWith(t));
    } else if (historyFilter === 'week') {
      const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
      filtered = filtered.filter((s) => new Date(s.date) >= weekAgo);
    } else if (historyFilter === 'month') {
      const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1);
      filtered = filtered.filter((s) => new Date(s.date) >= monthAgo);
    }
    if (historySubjectFilter !== 'all') {
      filtered = filtered.filter((s) => s.subject === historySubjectFilter);
    }
    return filtered;
  };
  const filteredSessions = getFilteredSessions();

  // ===== LOGIN =====
  if (!isJoined) {
    return (
      <>
        <CustomTitleBar />
        <div className="glass-panel login-container">
          <h1 className="title">Study Tracker</h1>
          <p className="subtitle">Entre e estude com seus amigos em tempo real</p>
          <form onSubmit={handleJoin} className="login-form">
            <input type="text" placeholder="Digite seu nome de usuário" value={username}
              onChange={(e) => setUsername(e.target.value)} required autoFocus />
            <button type="submit">Entrar <Play size={18} /></button>
          </form>
        </div>
      </>
    );
  }

  const tabs = [
    { id: 'estudar', label: 'Estudar', icon: <Clock size={16} /> },
    { id: 'materias', label: 'Matérias', icon: <BookOpen size={16} /> },
    { id: 'estatisticas', label: 'Estatísticas', icon: <BarChart3 size={16} /> },
    { id: 'amigos', label: 'Amigos', icon: <Users size={16} /> },
  ];

  return (
    <>
      <CustomTitleBar />

      {/* MSN Notifications */}
      <div className="msn-notification-stack">
        {notifications.map((n) => (
          <div key={n.id} className={`msn-notification msn-${n.type} ${n.leaving ? 'msn-leaving' : ''}`}>
            <div className="msn-notif-icon">
              {n.type === 'online' && '🟢'}{n.type === 'offline' && '⚪'}
              {n.type === 'studying' && '📖'}{n.type === 'idle' && '💤'}
            </div>
            <span className="msn-notif-text">{n.message}</span>
          </div>
        ))}
      </div>

      {viewingFriend && <FriendStatsModal friend={viewingFriend} onClose={() => setViewingFriend(null)} />}

      <div className="dashboard-container">
        <header className="dashboard-header glass-panel">
          <div>
            <h2 className="title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>Study Tracker</h2>
            <span className="username-badge">{username}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="zoom-btn" onClick={handleZoomOut} title="Diminuir zoom"><ZoomOut size={16} /></button>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '35px', textAlign: 'center' }}>{Math.round(zoomLevel * 100)}%</span>
            <button className="zoom-btn" onClick={handleZoomIn} title="Aumentar zoom"><ZoomIn size={16} /></button>
            <button className="mini-mode-btn" onClick={enterMiniMode} title="Modo Mini"><Minimize2 size={18} /></button>
            <button className="logout-btn" onClick={() => {
              setIsJoined(false); socket.disconnect();
              const s = createSocket(); s.on('users_update', (u) => setActiveUsers(u)); setSocket(s);
              setIsStudying(false); setStudyTime(0);
            }} title="Sair"><LogOut size={18} /></button>
          </div>
        </header>

        <nav className="tab-nav">
          {tabs.map((t) => (
            <button key={t.id} className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>

        {/* ===== ESTUDAR ===== */}
        {activeTab === 'estudar' && (
          <main className="tab-content">
            {/* === FOCUS MODE: quando está estudando === */}
            {isStudying ? (
              <>
                {/* Banner de foco */}
                <section className="focus-banner">
                  <div className="focus-info">
                    <span className="focus-label">Tempo de foco atual</span>
                    <div className="focus-timer-row">
                      <span className="focus-time">{fmt(studyTime)}</span>
                      <button className="focus-stop-btn" onClick={toggleStudy} title="Parar">
                        <Pause size={20} />
                      </button>
                    </div>
                    <span className="focus-subject">{selectedSubject}</span>
                  </div>
                  <div className="focus-daily-total">
                    <DeskIcon className="focus-desk-icon" />
                    <span className="focus-daily-time">{fmt(todayTotal + studyTime)}</span>
                  </div>
                </section>

                {/* Membros estudando header */}
                {studyingUsers.length > 0 && (
                  <div className="focus-members-header">
                    <span className="focus-members-count">
                      <span className="count-num">{studyingUsers.length}</span> membro{studyingUsers.length !== 1 ? 's' : ''} Estudando
                    </span>
                  </div>
                )}

                {/* Grid de membros estudando */}
                <section className="focus-members-section">
                  <div className="members-grid">
                    {[...studyingUsers]
                      .sort((a, b) => {
                        if (a.username === username) return -1;
                        if (b.username === username) return 1;
                        return (a.studyStartTime || 0) - (b.studyStartTime || 0);
                      })
                      .map((user, i) => {
                        const isMe = user.username === username;
                        return (
                          <div key={i} className={`member-avatar-card ${isMe ? 'avatar-me' : ''}`}
                            onClick={() => !isMe && setViewingFriend(user)}>
                            <DeskIcon className={`desk-status-icon ${isMe ? 'desk-me' : 'desk-studying'}`} />
                            <span className={`avatar-name ${isMe ? 'name-vibrant' : ''}`}>
                              {user.username}
                            </span>
                            {isMe ? (
                              <span className="avatar-time">{fmt(studyTime)}</span>
                            ) : (
                              <LiveTimer startTime={user.studyStartTime} initialElapsed={user.studyElapsed} />
                            )}
                          </div>
                        );
                      })}
                  </div>
                </section>

                {/* Amigos online que NÃO estão estudando */}
                {activeUsers.filter((u) => !u.isStudying && u.username !== username).length > 0 && (
                  <section className="focus-idle-section">
                    <div className="members-grid idle-grid">
                      {activeUsers.filter((u) => !u.isStudying && u.username !== username).map((user, i) => (
                        <div key={i} className="member-avatar-card avatar-idle" onClick={() => setViewingFriend(user)}>
                          <DeskIcon className="desk-status-icon desk-idle" />
                          <span className="avatar-name">{user.username}</span>
                          <span className="avatar-time">{fmt(user.todaySeconds || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            ) : showTimeline ? (
              /* === TIMELINE MODE: após pausar === */
              <DailyTimeline
                sessions={sessionHistory}
                subjects={subjects}
                selectedSubject={selectedSubject}
                totalTodaySeconds={todayTotal}
                onResume={() => {
                  if (!selectedSubject) { showMSNNotif('Selecione uma matéria primeiro!', 'idle'); return; }
                  toggleStudy();
                }}
                onBack={() => setShowTimeline(false)}
              />
            ) : (
              /* === IDLE MODE: quando NÃO está estudando === */
              <>
                <section className="timer-section glass-panel">
                  <div className="subject-select-group">
                    <label>Matéria:</label>
                    <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}>
                      <option value="">Selecione...</option>
                      {subjects.map((s, i) => <option key={i} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="timer-display">
                    <Clock className="timer-icon" size={24} />
                    <span className="time">00:00:00</span>
                  </div>

                  <button className="study-btn" onClick={toggleStudy}>
                    <Play size={20} fill="currentColor" /> Iniciar Estudo
                  </button>
                </section>

                {/* Quem está estudando agora */}
                {studyingUsers.length > 0 && (
                  <section className="focus-members-section">
                    <div className="focus-members-header">
                      <span className="focus-members-count">
                        <span className="count-num">{studyingUsers.length}</span> membro{studyingUsers.length !== 1 ? 's' : ''} estudando agora
                      </span>
                    </div>
                    <div className="members-grid">
                      {studyingUsers.map((user, i) => {
                        const isMe = user.username === username;
                        return (
                          <div key={i} className="member-avatar-card" onClick={() => !isMe && setViewingFriend(user)}>
                            <DeskIcon className="desk-status-icon desk-studying" />
                            <span className="avatar-name">{user.username}</span>
                            {isMe ? (
                              <span className="avatar-time">{fmt(studyTime)}</span>
                            ) : (
                              <LiveTimer startTime={user.studyStartTime} initialElapsed={user.studyElapsed} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Lançamento manual */}
                <section className="glass-panel manual-entry-section">
                  <h3 className="section-title"><Plus size={18} /> Lançar Horas Manualmente</h3>
                  <form onSubmit={handleManualSession} className="manual-form">
                    <div className="manual-row">
                      <select value={manualSubject} onChange={(e) => setManualSubject(e.target.value)} required>
                        <option value="">Matéria...</option>
                        {subjects.map((s, i) => <option key={i} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="manual-row">
                      <div className="q-field"><label>Horas</label><input type="number" min="0" placeholder="0" value={manualHours} onChange={(e) => setManualHours(e.target.value)} /></div>
                      <div className="q-field"><label>Minutos</label><input type="number" min="0" max="59" placeholder="0" value={manualMinutes} onChange={(e) => setManualMinutes(e.target.value)} /></div>
                    </div>
                    <div className="manual-row">
                      <div className="q-field"><label><Calendar size={12} /> Data</label><input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} /></div>
                      <button type="submit" className="manual-submit"><Plus size={16} /> Lançar</button>
                    </div>
                  </form>
                </section>

                {/* Lançamento em massa (bulk hours) */}
                <section className="glass-panel manual-entry-section">
                  <h3 className="section-title"><CalendarDays size={18} /> Adicionar Horas em Período</h3>
                  <p className="bulk-description">Distribua horas de estudo igualmente ao longo de um intervalo de datas.</p>
                  <form onSubmit={handleBulkHours} className="manual-form">
                    <div className="manual-row">
                      <select value={bulkSubject} onChange={(e) => setBulkSubject(e.target.value)} required>
                        <option value="">Matéria...</option>
                        {subjects.map((s, i) => <option key={i} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="manual-row">
                      <div className="q-field"><label>Total Horas</label><input type="number" min="0" placeholder="0" value={bulkHours} onChange={(e) => setBulkHours(e.target.value)} /></div>
                      <div className="q-field"><label>Minutos</label><input type="number" min="0" max="59" placeholder="0" value={bulkMinutes} onChange={(e) => setBulkMinutes(e.target.value)} /></div>
                    </div>
                    <div className="manual-row">
                      <div className="q-field"><label><Calendar size={12} /> De</label><input type="date" value={bulkStartDate} onChange={(e) => setBulkStartDate(e.target.value)} required /></div>
                      <div className="q-field"><label><Calendar size={12} /> Até</label><input type="date" value={bulkEndDate} onChange={(e) => setBulkEndDate(e.target.value)} required /></div>
                    </div>
                    <button type="submit" className="manual-submit bulk-submit"><Plus size={16} /> Adicionar Período</button>
                  </form>
                </section>
                <section className="recent-sessions glass-panel">
                  <div className="section-header-with-actions">
                    <h3 className="section-title"><Clock size={18} /> Sessões Recentes</h3>
                    {sessionHistory.length > 0 && (
                      <button className="clear-all-btn" onClick={() => {
                        if (confirm('Deseja excluir TODAS as sessões de estudo?')) {
                          clearAllSessions();
                          setSessionHistory([]);
                          setStats(getStats());
                          showMSNNotif('Todas as sessões foram excluídas', 'idle');
                          if (socket) socket.emit('update_stats', getStats());
                        }
                      }}>
                        <Trash2 size={14} /> Limpar Tudo
                      </button>
                    )}
                  </div>

                  {/* Filtros */}
                  <div className="history-filters">
                    <div className="filter-group">
                      {['all', 'today', 'week', 'month'].map((f) => (
                        <button key={f} className={`filter-btn ${historyFilter === f ? 'active' : ''}`}
                          onClick={() => setHistoryFilter(f)}>
                          {f === 'all' ? 'Todas' : f === 'today' ? 'Hoje' : f === 'week' ? 'Semana' : 'Mês'}
                        </button>
                      ))}
                    </div>
                    <select className="filter-subject-select" value={historySubjectFilter}
                      onChange={(e) => setHistorySubjectFilter(e.target.value)}>
                      <option value="all">Todas matérias</option>
                      {subjects.map((s, i) => <option key={i} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="sessions-list">
                    {filteredSessions.slice(-15).reverse().map((s, i) => {
                      const actualIndex = sessionHistory.indexOf(s);
                      return (
                        <div key={i} className="session-item">
                          <div className="session-info">
                            <div className="session-subject">{s.subject}</div>
                            <div className="session-meta">
                              <span>{new Date(s.date).toLocaleDateString('pt-BR')}</span>
                              <span className="session-duration">{fmtHours(s.duration / 3600)}</span>
                              {s.manual && <span className="session-manual-badge">manual</span>}
                            </div>
                          </div>
                          <button className="delete-session-btn" onClick={() => {
                            deleteSession(actualIndex);
                            setSessionHistory(getSessions());
                            setStats(getStats());
                            showMSNNotif('Sessão excluída', 'idle');
                            if (socket) socket.emit('update_stats', getStats());
                          }} title="Excluir sessão">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                    {filteredSessions.length === 0 && <p className="empty-state">Nenhuma sessão encontrada.</p>}
                  </div>
                </section>
              </>
            )}
          </main>
        )}

        {/* ===== MATÉRIAS ===== */}
        {activeTab === 'materias' && (
          <main className="tab-content">
            <section className="glass-panel" style={{ padding: '2rem' }}>
              <h3 className="section-title"><BookOpen size={18} /> Gerenciar Matérias</h3>
              <form onSubmit={handleAddSubject} className="add-subject-form">
                <input type="text" placeholder="Nome da matéria" value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)} required />
                <button type="submit"><Plus size={16} /> Adicionar</button>
              </form>
              <div className="subjects-grid">
                {subjects.map((s, i) => (
                  <div key={i} className="subject-card">
                    <span className="subject-name">{s}</span>
                    <button className="subject-remove" onClick={() => handleRemoveSubject(s)}><Trash2 size={14} /></button>
                  </div>
                ))}
                {subjects.length === 0 && <p className="empty-state">Nenhuma matéria cadastrada.</p>}
              </div>
            </section>
          </main>
        )}

        {/* ===== ESTATÍSTICAS ===== */}
        {activeTab === 'estatisticas' && stats && (
          <main className="tab-content">
            <div className="stats-cards">
              <div className="stat-card glass-panel"><div className="stat-value">{fmtHours(stats.totalHours)}</div><div className="stat-label">Total Estudado</div></div>
              <div className="stat-card glass-panel"><div className="stat-value">{stats.totalSessions}</div><div className="stat-label">Sessões</div></div>
              <div className="stat-card glass-panel"><div className="stat-value">{fmtHours(stats.dailyAvgHours)}</div><div className="stat-label">Média Diária</div></div>
              <div className="stat-card glass-panel"><div className="stat-value">{fmtHours(stats.weeklyAvgHours)}</div><div className="stat-label">Média Semanal</div></div>
            </div>

            {/* Consulta por intervalo de datas */}
            <section className="glass-panel range-query-section">
              <h3 className="section-title"><CalendarDays size={18} /> Consultar Período</h3>
              <div className="range-form">
                <div className="range-inputs">
                  <div className="q-field">
                    <label>De</label>
                    <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
                  </div>
                  <div className="q-field">
                    <label>Até</label>
                    <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
                  </div>
                  <button className="range-query-btn" onClick={handleRangeQuery} type="button">
                    <Search size={16} /> Consultar
                  </button>
                </div>
              </div>
              {rangeStats && (
                <div className="range-results">
                  <div className="range-summary">
                    <span className="range-period">
                      {new Date(rangeStart + 'T12:00:00').toLocaleDateString('pt-BR')} → {new Date(rangeEnd + 'T12:00:00').toLocaleDateString('pt-BR')}
                      <span className="range-days">({rangeStats.daysInRange} dias)</span>
                    </span>
                  </div>
                  <div className="range-stats-cards">
                    <div className="range-stat">
                      <div className="range-stat-val">{fmtHours(rangeStats.totalHours)}</div>
                      <div className="stat-label">Total</div>
                    </div>
                    <div className="range-stat">
                      <div className="range-stat-val">{rangeStats.totalSessions}</div>
                      <div className="stat-label">Sessões</div>
                    </div>
                    <div className="range-stat">
                      <div className="range-stat-val">{fmtHours(rangeStats.dailyAvgHours)}</div>
                      <div className="stat-label">Média/Dia</div>
                    </div>
                  </div>
                  {Object.keys(rangeStats.subjectMap).length > 0 && (
                    <div className="range-subjects">
                      <h4>Por Matéria</h4>
                      {Object.entries(rangeStats.subjectMap).sort((a, b) => b[1].totalSeconds - a[1].totalSeconds).map(([subj, d], i) => (
                        <div key={i} className="modal-subj-row">
                          <span>{subj}</span>
                          <span className="modal-subj-hours">{fmtHours(d.totalSeconds / 3600)} ({d.sessions} sessões)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="glass-panel" style={{ padding: '2rem' }}>
              <h3 className="section-title"><BarChart3 size={18} /> Últimos 7 Dias</h3>
              <div className="weekly-chart">
                {stats.last7.map((d, i) => {
                  const maxH = Math.max(...stats.last7.map((x) => x.hours), 1);
                  const pct = (d.hours / maxH) * 100;
                  return (
                    <div key={i} className="chart-bar-col">
                      <div className="chart-bar-value">{d.hours > 0 ? fmtHours(d.hours) : ''}</div>
                      <div className="chart-bar-track"><div className="chart-bar-fill" style={{ height: `${Math.max(pct, 2)}%` }} /></div>
                      <div className="chart-bar-label">{d.label}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            {Object.keys(stats.subjectMap).length > 0 && (
              <section className="glass-panel" style={{ padding: '2rem' }}>
                <h3 className="section-title"><BookOpen size={18} /> Horas por Matéria</h3>
                <div className="subject-stats-list">
                  {Object.entries(stats.subjectMap).sort((a, b) => b[1].totalSeconds - a[1].totalSeconds).map(([subj, d], i) => {
                    const maxSec = Math.max(...Object.values(stats.subjectMap).map((x) => x.totalSeconds), 1);
                    const pct = (d.totalSeconds / maxSec) * 100;
                    return (
                      <div key={i} className="subject-stat-row">
                        <span className="subject-stat-name">{subj}</span>
                        <div className="subject-stat-bar-track"><div className="subject-stat-bar-fill hours" style={{ width: `${pct}%` }} /></div>
                        <span className="subject-stat-pct">{fmtHours(d.totalSeconds / 3600)}</span>
                        <span className="subject-stat-detail">{d.sessions} sessões</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </main>
        )}

        {/* ===== AMIGOS ===== */}
        {activeTab === 'amigos' && (
          <main className="tab-content">
            <section className="glass-panel" style={{ padding: '2rem' }}>
              <h3 className="section-title">
                <Users size={20} /> Amigos Online ({onlineFriends.length})
              </h3>
              <div className="friends-list">
                {onlineFriends.map((user, i) => (
                  <div key={i} className="friend-item" onClick={() => setViewingFriend(user)} style={{ cursor: 'pointer' }}>
                    <div className="friend-info">
                      <div className="avatar">{user.username.charAt(0).toUpperCase()}</div>
                      <div className="friend-details">
                        <span className="friend-name">{user.username}</span>
                        {user.isStudying && user.subject && (
                          <span className="friend-study-detail">Estudando: {user.subject}</span>
                        )}
                      </div>
                    </div>
                    <div className="friend-right">
                      <div className={`status-badge ${user.isStudying ? 'status-studying' : 'status-idle'}`}>
                        {user.isStudying ? 'Estudando' : 'Parado'}
                      </div>
                      <button className="view-stats-btn" onClick={(e) => { e.stopPropagation(); setViewingFriend(user); }} title="Ver estatísticas">
                        <Eye size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {onlineFriends.length === 0 && (
                  <div className="empty-state"><p>Nenhum amigo online agora.</p></div>
                )}
              </div>
            </section>
          </main>
        )}
      </div>
    </>
  );
}

export default function Root() {
  if (isMiniWindow) return <FloatingAvatar />;
  return <App />;
}

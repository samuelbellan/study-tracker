import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Play, Square, Users, Clock, LogOut, Minimize2, Maximize2, X, Minus,
  BookOpen, BarChart3, ClipboardList, Plus, Trash2, CheckCircle, XCircle, Target, Eye
} from 'lucide-react';
import './App.css';
import {
  getSubjects, addSubject, removeSubject,
  getSessions, saveSession,
  getQuestions, saveQuestionEntry, getStats
} from './StudyData';

const SOCKET_URL = 'https://study-tracker-2t7y.onrender.com';

const urlParams = new URLSearchParams(window.location.search);
const isMiniWindow = urlParams.get('mini') === 'true';
const miniUser = urlParams.get('user') || '';
const miniStudying = urlParams.get('studying') === 'true';
const miniIsMe = urlParams.get('me') === 'true';

// ===== Som MSN =====
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

// ===== Barra de Título =====
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

// ===== Avatar Flutuante =====
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
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};
const fmtHours = (h) => h < 1 ? `${Math.round(h * 60)}min` : `${h.toFixed(1)}h`;

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
          <div className="modal-stat"><div className="modal-stat-val">{s.accuracy || 0}%</div><div className="stat-label">Aproveitamento</div></div>
        </div>

        <div className="modal-section">
          <h4>Questões</h4>
          <div className="modal-q-row">
            <span>Total: <strong>{s.totalQuestions || 0}</strong></span>
            <span className="q-correct"><CheckCircle size={12} /> {s.totalCorrect || 0}</span>
            <span className="q-wrong"><XCircle size={12} /> {s.totalWrong || 0}</span>
          </div>
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
  const [studyType, setStudyType] = useState('teoria'); // 'teoria' ou 'questoes'
  const [newSubject, setNewSubject] = useState('');
  const [qSubject, setQSubject] = useState('');
  const [qTotal, setQTotal] = useState('');
  const [qCorrect, setQCorrect] = useState('');
  const [stats, setStats] = useState(null);
  const [questionHistory, setQuestionHistory] = useState(getQuestions());
  const [sessionHistory, setSessionHistory] = useState(getSessions());
  const [viewingFriend, setViewingFriend] = useState(null);
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

  // Enviar stats ao servidor para amigos verem
  const broadcastStats = (s) => {
    if (s && socket && socket.connected) {
      const myStats = getStats();
      socket.emit('update_stats', myStats);
    }
  };

  useEffect(() => {
    const s = createSocket();
    setSocket(s);
    s.on('users_update', (users) => {
      setActiveUsers((prev) => {
        const prevNames = new Set(prev.map((u) => u.username));
        const newNames = new Set(users.map((u) => u.username));
        const me = localStorage.getItem('studytracker_username');
        users.forEach((u) => { if (!prevNames.has(u.username) && u.username !== me) showMSNNotif(`${u.username} ficou online`, 'online'); });
        prev.forEach((u) => { if (!newNames.has(u.username) && u.username !== me) showMSNNotif(`${u.username} ficou offline`, 'offline'); });
        users.forEach((u) => {
          const old = prev.find((p) => p.username === u.username);
          if (old && u.username !== me) {
            if (!old.isStudying && u.isStudying) {
              const detail = u.subject ? ` (${u.studyType === 'questoes' ? 'Questões' : 'Teoria'} - ${u.subject})` : '';
              showMSNNotif(`${u.username} começou a estudar!${detail} 📖`, 'studying');
            } else if (old.isStudying && !u.isStudying) showMSNNotif(`${u.username} parou de estudar`, 'idle');
          }
        });
        return users;
      });
    });
    return () => s.close();
  }, []);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && isJoined && username) {
        if (!socket || socket.disconnected) {
          const s = createSocket();
          s.on('users_update', (users) => setActiveUsers(users));
          s.on('connect', () => { s.emit('user_join', username); broadcastStats(s); });
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
    if (activeTab === 'questoes') setQuestionHistory(getQuestions());
    if (activeTab === 'estudar') setSessionHistory(getSessions());
  }, [activeTab]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (username.trim() && socket) {
      socket.emit('user_join', username.trim());
      localStorage.setItem('studytracker_username', username.trim());
      setIsJoined(true);
      // Broadcast stats ao entrar
      setTimeout(() => {
        const myStats = getStats();
        socket.emit('update_stats', myStats);
      }, 1000);
    }
  };

  const toggleStudy = () => {
    if (!socket) return;
    if (isStudying) {
      socket.emit('stop_study', username);
      setIsStudying(false);
      if (startTimeRef.current && selectedSubject) {
        saveSession({
          subject: selectedSubject, studyType,
          date: new Date().toISOString(), duration: studyTime,
          startTime: startTimeRef.current, endTime: new Date().toISOString()
        });
        setSessionHistory(getSessions());
        // Atualizar stats e broadcast
        const myStats = getStats();
        socket.emit('update_stats', myStats);
      }
      setStudyTime(0);
    } else {
      if (!selectedSubject) { showMSNNotif('Selecione uma matéria primeiro!', 'idle'); return; }
      socket.emit('start_study', { username, studyType, subject: selectedSubject });
      setIsStudying(true);
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

  const handleAddQuestion = (e) => {
    e.preventDefault();
    if (!qSubject || !qTotal) return;
    const total = parseInt(qTotal), correct = parseInt(qCorrect) || 0;
    if (total <= 0 || correct < 0 || correct > total) return;
    saveQuestionEntry({ subject: qSubject, date: new Date().toISOString(), total, correct });
    setQuestionHistory(getQuestions());
    showMSNNotif(`${total} questões registradas em ${qSubject}`, 'studying');
    setQTotal(''); setQCorrect('');
    // Broadcast stats atualizadas
    if (socket) socket.emit('update_stats', getStats());
  };

  const enterMiniMode = () => {
    if (window.electronAPI) {
      const users = activeUsers.map((u) => ({ username: u.username, isStudying: u.isStudying, isMe: u.username === username }));
      if (users.length === 0) users.push({ username, isStudying, isMe: true });
      setInMiniMode(true);
      window.electronAPI.enterMiniMode(users);
    }
  };

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
    { id: 'questoes', label: 'Questões', icon: <ClipboardList size={16} /> },
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

      {/* Modal Stats Amigo */}
      {viewingFriend && <FriendStatsModal friend={viewingFriend} onClose={() => setViewingFriend(null)} />}

      <div className="dashboard-container">
        <header className="dashboard-header glass-panel">
          <div>
            <h2 className="title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>Study Tracker</h2>
            <span className="username-badge">{username}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
            <section className="timer-section glass-panel">
              <div className="study-config">
                <div className="subject-select-group">
                  <label>Matéria:</label>
                  <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} disabled={isStudying}>
                    <option value="">Selecione...</option>
                    {subjects.map((s, i) => <option key={i} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="study-type-group">
                  <label>Tipo:</label>
                  <div className="study-type-buttons">
                    <button type="button"
                      className={`type-btn ${studyType === 'teoria' ? 'active' : ''}`}
                      onClick={() => !isStudying && setStudyType('teoria')}
                      disabled={isStudying}>
                      📚 Teoria
                    </button>
                    <button type="button"
                      className={`type-btn ${studyType === 'questoes' ? 'active' : ''}`}
                      onClick={() => !isStudying && setStudyType('questoes')}
                      disabled={isStudying}>
                      ✅ Questões
                    </button>
                  </div>
                </div>
              </div>

              <div className="timer-display">
                <Clock className="timer-icon" size={24} />
                <span className="time">{fmt(studyTime)}</span>
              </div>

              {selectedSubject && isStudying && (
                <span className="studying-label">
                  {studyType === 'questoes' ? '✅ Questões' : '📚 Teoria'} — <strong>{selectedSubject}</strong>
                </span>
              )}

              <button className={`study-btn ${isStudying ? 'studying' : ''}`} onClick={toggleStudy}>
                {isStudying ? (<><Square size={20} fill="currentColor" /> Parar</>) : (<><Play size={20} fill="currentColor" /> Iniciar Estudo</>)}
              </button>
            </section>

            <section className="recent-sessions glass-panel">
              <h3 className="section-title"><Clock size={18} /> Sessões Recentes</h3>
              <div className="sessions-list">
                {sessionHistory.slice(-10).reverse().map((s, i) => (
                  <div key={i} className="session-item">
                    <div className="session-info-left">
                      <div className="session-subject">{s.subject}</div>
                      <span className="session-type-badge">{s.studyType === 'questoes' ? '✅ Questões' : '📚 Teoria'}</span>
                    </div>
                    <div className="session-meta">
                      <span>{new Date(s.date).toLocaleDateString('pt-BR')}</span>
                      <span className="session-duration">{fmtHours(s.duration / 3600)}</span>
                    </div>
                  </div>
                ))}
                {sessionHistory.length === 0 && <p className="empty-state">Nenhuma sessão registrada ainda.</p>}
              </div>
            </section>
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

        {/* ===== QUESTÕES ===== */}
        {activeTab === 'questoes' && (
          <main className="tab-content">
            <section className="glass-panel" style={{ padding: '2rem' }}>
              <h3 className="section-title"><ClipboardList size={18} /> Registrar Questões</h3>
              <form onSubmit={handleAddQuestion} className="question-form">
                <select value={qSubject} onChange={(e) => setQSubject(e.target.value)} required>
                  <option value="">Matéria...</option>
                  {subjects.map((s, i) => <option key={i} value={s}>{s}</option>)}
                </select>
                <div className="question-inputs">
                  <div className="q-field"><label>Total</label><input type="number" min="1" placeholder="0" value={qTotal} onChange={(e) => setQTotal(e.target.value)} required /></div>
                  <div className="q-field"><label>Acertos</label><input type="number" min="0" placeholder="0" value={qCorrect} onChange={(e) => setQCorrect(e.target.value)} required /></div>
                </div>
                <button type="submit"><Target size={16} /> Registrar</button>
              </form>
            </section>
            <section className="glass-panel" style={{ padding: '2rem' }}>
              <h3 className="section-title"><ClipboardList size={18} /> Histórico</h3>
              <div className="sessions-list">
                {questionHistory.slice(-15).reverse().map((q, i) => (
                  <div key={i} className="session-item">
                    <div className="session-subject">{q.subject}</div>
                    <div className="session-meta">
                      <span>{new Date(q.date).toLocaleDateString('pt-BR')}</span>
                      <span className="q-stats">
                        <span className="q-correct"><CheckCircle size={12} /> {q.correct}</span>
                        <span className="q-wrong"><XCircle size={12} /> {q.total - q.correct}</span>
                        <span className="q-pct">{((q.correct / q.total) * 100).toFixed(0)}%</span>
                      </span>
                    </div>
                  </div>
                ))}
                {questionHistory.length === 0 && <p className="empty-state">Nenhuma questão registrada.</p>}
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

            <section className="glass-panel" style={{ padding: '2rem' }}>
              <h3 className="section-title"><Target size={18} /> Resumo de Questões</h3>
              <div className="stats-cards" style={{ marginBottom: '1rem' }}>
                <div className="stat-card-sm"><div className="stat-value-sm">{stats.totalQuestions}</div><div className="stat-label">Total</div></div>
                <div className="stat-card-sm correct"><div className="stat-value-sm">{stats.totalCorrect}</div><div className="stat-label">Acertos</div></div>
                <div className="stat-card-sm wrong"><div className="stat-value-sm">{stats.totalWrong}</div><div className="stat-label">Erros</div></div>
                <div className="stat-card-sm"><div className="stat-value-sm">{stats.accuracy}%</div><div className="stat-label">Aproveitamento</div></div>
              </div>
              {Object.keys(stats.questionsBySubject).length > 0 && (
                <div className="subject-stats-list">
                  {Object.entries(stats.questionsBySubject).map(([subj, d], i) => {
                    const pct = d.total > 0 ? ((d.correct / d.total) * 100).toFixed(0) : 0;
                    return (
                      <div key={i} className="subject-stat-row">
                        <span className="subject-stat-name">{subj}</span>
                        <div className="subject-stat-bar-track"><div className="subject-stat-bar-fill" style={{ width: `${pct}%` }} /></div>
                        <span className="subject-stat-pct">{pct}%</span>
                        <span className="subject-stat-detail">{d.correct}/{d.total}</span>
                      </div>
                    );
                  })}
                </div>
              )}
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
                <Users size={20} /> Amigos Online ({Math.max(0, activeUsers.length - 1)})
              </h3>
              <div className="friends-list">
                {activeUsers.filter((u) => u.username !== username).map((user, i) => (
                  <div key={i} className="friend-item" onClick={() => setViewingFriend(user)} style={{ cursor: 'pointer' }}>
                    <div className="friend-info">
                      <div className="avatar">{user.username.charAt(0).toUpperCase()}</div>
                      <div className="friend-details">
                        <span className="friend-name">{user.username}</span>
                        {user.isStudying && user.subject && (
                          <span className="friend-study-detail">
                            {user.studyType === 'questoes' ? '✅ Questões' : '📚 Teoria'} — {user.subject}
                          </span>
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
                {activeUsers.filter((u) => u.username !== username).length === 0 && (
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

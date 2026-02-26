import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Play, Square, Users, Clock, LogOut, Bell } from 'lucide-react';
import './App.css';

// Configuração do Socket
// No ambiente de dev original era 3000. Agora usa o Túnel Público.
const SOCKET_URL = 'https://study-tracker-app.loca.lt/';

function App() {
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isStudying, setIsStudying] = useState(false);
  const [studyTime, setStudyTime] = useState(0); // em segundos
  const [activeUsers, setActiveUsers] = useState([]);
  const [toast, setToast] = useState(null);

  const timerRef = useRef(null);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      extraHeaders: {
        'Bypass-Tunnel-Reminder': 'true' // Bypasses the localtunnel warning page
      }
    });
    setSocket(newSocket);

    // Listeners
    newSocket.on('users_update', (users) => {
      setActiveUsers(users);
    });

    newSocket.on('friend_started_studying', (friendName) => {
      showToast(`${friendName} started studying! 🚀`);
      // Opcional: Integração com Toast Nativo do SO via Electron aqui
      if (window.electronAPI && window.electronAPI.showNotification) {
        window.electronAPI.showNotification('Study Tracker', `${friendName} started studying!`);
      }
    });

    return () => newSocket.close();
  }, []);

  useEffect(() => {
    if (isStudying) {
      timerRef.current = setInterval(() => {
        setStudyTime((prevTime) => prevTime + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isStudying]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (username.trim() && socket) {
      socket.emit('user_join', username.trim());
      setIsJoined(true);
    }
  };

  const toggleStudy = () => {
    if (!socket) return;

    if (isStudying) {
      socket.emit('stop_study', username);
      setIsStudying(false);
    } else {
      socket.emit('start_study', username);
      setIsStudying(true);
    }
  };

  const formatTime = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num) => num.toString().padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  if (!isJoined) {
    return (
      <div className="glass-panel login-container">
        <h1 className="title">Study Tracker</h1>
        <p className="subtitle">Join and study with friends in real-time</p>
        <form onSubmit={handleJoin} className="login-form">
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
          <button type="submit">
            Enter <Play size={18} />
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Toast Notification */}
      {toast && (
        <div className="toast slide-in">
          <Bell size={18} />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <header className="dashboard-header glass-panel">
        <div>
          <h2 className="title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>Study Tracker</h2>
          <span className="username-badge">{username}</span>
        </div>
        <button
          className="logout-btn"
          onClick={() => {
            setIsJoined(false);
            socket.disconnect();
            const newSocket = io(SOCKET_URL, {
              extraHeaders: {
                'Bypass-Tunnel-Reminder': 'true'
              }
            });
            setSocket(newSocket);
            setIsStudying(false);
            setStudyTime(0);
          }}
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </header>

      <main className="dashboard-content">
        {/* Timer Section */}
        <section className="timer-section glass-panel">
          <div className="timer-display">
            <Clock className="timer-icon" size={24} />
            <span className="time">{formatTime(studyTime)}</span>
          </div>
          <button
            className={`study-btn ${isStudying ? 'studying' : ''}`}
            onClick={toggleStudy}
          >
            {isStudying ? (
              <>
                <Square size={20} fill="currentColor" /> Stop Studying
              </>
            ) : (
              <>
                <Play size={20} fill="currentColor" /> Start Studying
              </>
            )}
          </button>
        </section>

        {/* Friends Section */}
        <section className="friends-section glass-panel">
          <h3 className="section-title">
            <Users size={20} /> Active Friends ({activeUsers.length - 1 < 0 ? 0 : activeUsers.length - 1} Online)
          </h3>
          <div className="friends-list">
            {activeUsers
              .filter(user => user.username !== username) // Hide self
              .map((user, index) => (
                <div key={index} className="friend-item">
                  <div className="friend-info">
                    <div className="avatar">{user.username.charAt(0).toUpperCase()}</div>
                    <span className="friend-name">{user.username}</span>
                  </div>
                  <div className={`status-badge ${user.isStudying ? 'status-studying' : 'status-idle'}`}>
                    {user.isStudying ? 'Studying' : 'Idle'}
                  </div>
                </div>
              ))}

            {activeUsers.filter(user => user.username !== username).length === 0 && (
              <div className="empty-state">
                <p>No friends online right now.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;

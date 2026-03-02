// ===== StudyData.js =====
// API client for study data — connects to backend REST API
// Falls back to localStorage for offline/migration support

const API_BASE = 'https://study-tracker-2t7y.onrender.com/api';
const STORAGE_KEY = 'studytracker_data';
const MIGRATION_KEY = 'studytracker_migrated';

let _userId = null;
let _cachedSessions = null;
let _cachedSubjects = null;

export function setUserId(id) { _userId = id; }
export function getUserId() { return _userId; }

// ===== Auth =====
export async function loginUser(username) {
    const res = await fetch(`${API_BASE}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });
    const data = await res.json();
    _userId = data.userId;
    _cachedSubjects = data.subjects || [];
    localStorage.setItem('studytracker_userId', data.userId);
    localStorage.setItem('studytracker_username', username);
    return data;
}

// ===== Migration from localStorage =====
export async function migrateLocalData() {
    if (!_userId) return;
    if (localStorage.getItem(MIGRATION_KEY)) return; // Already migrated

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { localStorage.setItem(MIGRATION_KEY, 'true'); return; }

    try {
        const data = JSON.parse(raw);
        const sessions = data.sessions || [];
        const subjects = data.subjects || [];

        // Import subjects
        for (const name of subjects) {
            await fetch(`${API_BASE}/subjects/${_userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'add', name })
            });
        }

        // Bulk import sessions
        if (sessions.length > 0) {
            await fetch(`${API_BASE}/sessions/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: _userId, sessions })
            });
        }

        localStorage.setItem(MIGRATION_KEY, 'true');
        console.log(`Migrated ${sessions.length} sessions and ${subjects.length} subjects to server`);
    } catch (e) {
        console.error('Migration failed:', e);
    }
}

// ===== Matérias (Subjects) =====
export async function getSubjectsAsync() {
    if (!_userId) return _cachedSubjects || [];
    try {
        const res = await fetch(`${API_BASE}/subjects/${_userId}`);
        const data = await res.json();
        _cachedSubjects = data;
        return data;
    } catch (e) {
        return _cachedSubjects || [];
    }
}

// Synchronous getter for cached data
export function getSubjects() {
    return _cachedSubjects || [];
}

export async function addSubject(name) {
    if (!_userId) return _cachedSubjects || [];
    try {
        const res = await fetch(`${API_BASE}/subjects/${_userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', name })
        });
        const data = await res.json();
        _cachedSubjects = data;
        return data;
    } catch (e) {
        // Fallback: add locally
        if (!_cachedSubjects) _cachedSubjects = [];
        if (!_cachedSubjects.includes(name)) _cachedSubjects.push(name);
        return _cachedSubjects;
    }
}

export async function removeSubject(name) {
    if (!_userId) return _cachedSubjects || [];
    try {
        const res = await fetch(`${API_BASE}/subjects/${_userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'remove', name })
        });
        const data = await res.json();
        _cachedSubjects = data;
        return data;
    } catch (e) {
        if (_cachedSubjects) _cachedSubjects = _cachedSubjects.filter(s => s !== name);
        return _cachedSubjects || [];
    }
}

// ===== Sessões de Estudo =====
export async function getSessionsAsync() {
    if (!_userId) return _cachedSessions || [];
    try {
        const res = await fetch(`${API_BASE}/sessions/${_userId}`);
        const data = await res.json();
        _cachedSessions = data;
        return data;
    } catch (e) {
        return _cachedSessions || [];
    }
}

export function getSessions() {
    return _cachedSessions || [];
}

export async function saveSession(session) {
    if (!_userId) return _cachedSessions || [];
    try {
        await fetch(`${API_BASE}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: _userId, ...session })
        });
        return await getSessionsAsync();
    } catch (e) {
        console.error('Failed to save session:', e);
        return _cachedSessions || [];
    }
}

export async function editSession(id, updates) {
    try {
        await fetch(`${API_BASE}/sessions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        return await getSessionsAsync();
    } catch (e) {
        console.error('Failed to edit session:', e);
        return _cachedSessions || [];
    }
}

export async function deleteSession(id) {
    try {
        await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
        return await getSessionsAsync();
    } catch (e) {
        console.error('Failed to delete session:', e);
        return _cachedSessions || [];
    }
}

export async function clearAllSessions() {
    if (!_userId) return [];
    try {
        await fetch(`${API_BASE}/sessions/user/${_userId}`, { method: 'DELETE' });
        _cachedSessions = [];
        return [];
    } catch (e) {
        console.error('Failed to clear sessions:', e);
        return _cachedSessions || [];
    }
}

// ===== Estatísticas =====
export async function getStatsAsync() {
    if (!_userId) return getStatsLocal();
    try {
        const res = await fetch(`${API_BASE}/stats/${_userId}`);
        return await res.json();
    } catch (e) {
        return getStatsLocal();
    }
}

// Synchronous fallback from cached data
export function getStats() {
    const sessions = _cachedSessions || [];
    return computeStats(sessions);
}

function computeStats(sessions) {
    const totalSeconds = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);
    const totalHours = totalSeconds / 3600;

    const uniqueDays = new Set(sessions.map(s => {
        const d = s.date instanceof Date ? s.date : new Date(s.date);
        return d.toISOString().split('T')[0];
    }));
    const daysCount = uniqueDays.size || 1;
    const dailyAvgHours = totalHours / daysCount;

    const firstSession = sessions.length > 0 ? new Date(sessions[sessions.length - 1].date) : new Date();
    const weeksDiff = Math.max(1, Math.ceil((new Date() - firstSession) / (7 * 24 * 3600 * 1000)));
    const weeklyAvgHours = totalHours / weeksDiff;

    const subjectMap = {};
    sessions.forEach(s => {
        if (!subjectMap[s.subject]) subjectMap[s.subject] = { totalSeconds: 0, sessions: 0 };
        subjectMap[s.subject].totalSeconds += s.duration || 0;
        subjectMap[s.subject].sessions += 1;
    });

    const last7 = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().split('T')[0];
        const dayLabel = d.toLocaleDateString('pt-BR', { weekday: 'short' });
        const daySessions = sessions.filter(s => {
            const sd = s.date instanceof Date ? s.date : new Date(s.date);
            return sd.toISOString().startsWith(dayStr);
        });
        const daySeconds = daySessions.reduce((acc, s) => acc + (s.duration || 0), 0);
        last7.push({ label: dayLabel, hours: daySeconds / 3600, date: dayStr });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const todaySessions = sessions.filter(s => {
        const sd = s.date instanceof Date ? s.date : new Date(s.date);
        return sd.toISOString().startsWith(todayStr);
    });
    const todaySeconds = todaySessions.reduce((acc, s) => acc + (s.duration || 0), 0);

    return { totalHours, totalSessions: sessions.length, dailyAvgHours, weeklyAvgHours, subjectMap, last7, todaySeconds };
}

function getStatsLocal() {
    return computeStats(_cachedSessions || []);
}

export function getStatsForRange(startDate, endDate) {
    const sessions = _cachedSessions || [];
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(endDate); end.setHours(23, 59, 59, 999);

    const filtered = sessions.filter(s => {
        const d = s.date instanceof Date ? s.date : new Date(s.date);
        return d >= start && d <= end;
    });

    const totalSeconds = filtered.reduce((acc, s) => acc + (s.duration || 0), 0);
    const totalHours = totalSeconds / 3600;
    const diffMs = end - start;
    const daysInRange = Math.max(1, Math.ceil(diffMs / (24 * 3600 * 1000)));
    const dailyAvgHours = totalHours / daysInRange;

    const subjectMap = {};
    filtered.forEach(s => {
        if (!subjectMap[s.subject]) subjectMap[s.subject] = { totalSeconds: 0, sessions: 0 };
        subjectMap[s.subject].totalSeconds += s.duration || 0;
        subjectMap[s.subject].sessions += 1;
    });

    return { totalHours, totalSessions: filtered.length, dailyAvgHours, daysInRange, subjectMap };
}

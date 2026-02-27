// ===== StudyData.js =====
// Módulo utilitário para persistência de dados de estudo no localStorage

const STORAGE_KEY = 'studytracker_data';

function getData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { subjects: [], sessions: [] };
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ===== Matérias =====
export function getSubjects() {
    return getData().subjects;
}

export function addSubject(name) {
    const data = getData();
    if (!data.subjects.includes(name)) {
        data.subjects.push(name);
        saveData(data);
    }
    return data.subjects;
}

export function removeSubject(name) {
    const data = getData();
    data.subjects = data.subjects.filter((s) => s !== name);
    saveData(data);
    return data.subjects;
}

// ===== Sessões de Estudo =====
export function getSessions() {
    return getData().sessions;
}

export function saveSession(session) {
    const data = getData();
    data.sessions.push(session);
    saveData(data);
    return data.sessions;
}

export function deleteSession(index) {
    const data = getData();
    data.sessions.splice(index, 1);
    saveData(data);
    return data.sessions;
}

export function clearAllSessions() {
    const data = getData();
    data.sessions = [];
    saveData(data);
    return data.sessions;
}

// ===== Estatísticas =====
export function getStats() {
    const sessions = getSessions();

    const totalSeconds = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);
    const totalHours = totalSeconds / 3600;

    const uniqueDays = new Set(sessions.map((s) => s.date?.split('T')[0]));
    const daysCount = uniqueDays.size || 1;
    const dailyAvgHours = totalHours / daysCount;

    const firstSession = sessions.length > 0 ? new Date(sessions[0].date) : new Date();
    const weeksDiff = Math.max(1, Math.ceil((new Date() - firstSession) / (7 * 24 * 3600 * 1000)));
    const weeklyAvgHours = totalHours / weeksDiff;

    // Por matéria
    const subjectMap = {};
    sessions.forEach((s) => {
        if (!subjectMap[s.subject]) subjectMap[s.subject] = { totalSeconds: 0, sessions: 0 };
        subjectMap[s.subject].totalSeconds += s.duration || 0;
        subjectMap[s.subject].sessions += 1;
    });

    // Últimos 7 dias
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().split('T')[0];
        const dayLabel = d.toLocaleDateString('pt-BR', { weekday: 'short' });
        const daySessions = sessions.filter((s) => s.date?.startsWith(dayStr));
        const daySeconds = daySessions.reduce((acc, s) => acc + (s.duration || 0), 0);
        last7.push({ label: dayLabel, hours: daySeconds / 3600, date: dayStr });
    }

    // Horas de hoje
    const todayStr = new Date().toISOString().split('T')[0];
    const todaySessions = sessions.filter((s) => s.date?.startsWith(todayStr));
    const todaySeconds = todaySessions.reduce((acc, s) => acc + (s.duration || 0), 0);

    return {
        totalHours,
        totalSessions: sessions.length,
        dailyAvgHours,
        weeklyAvgHours,
        subjectMap,
        last7,
        todaySeconds
    };
}

// ===== Estatísticas por Intervalo de Datas =====
export function getStatsForRange(startDate, endDate) {
    const sessions = getSessions();
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const filtered = sessions.filter((s) => {
        const d = new Date(s.date);
        return d >= start && d <= end;
    });

    const totalSeconds = filtered.reduce((acc, s) => acc + (s.duration || 0), 0);
    const totalHours = totalSeconds / 3600;

    // Dias no intervalo (mínimo 1)
    const diffMs = end - start;
    const daysInRange = Math.max(1, Math.ceil(diffMs / (24 * 3600 * 1000)));
    const dailyAvgHours = totalHours / daysInRange;

    // Por matéria
    const subjectMap = {};
    filtered.forEach((s) => {
        if (!subjectMap[s.subject]) subjectMap[s.subject] = { totalSeconds: 0, sessions: 0 };
        subjectMap[s.subject].totalSeconds += s.duration || 0;
        subjectMap[s.subject].sessions += 1;
    });

    return {
        totalHours,
        totalSessions: filtered.length,
        dailyAvgHours,
        daysInRange,
        subjectMap
    };
}

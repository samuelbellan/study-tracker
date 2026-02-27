// ===== StudyData.js =====
// Módulo utilitário para persistência de dados de estudo no localStorage

const STORAGE_KEY = 'studytracker_data';

function getData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { subjects: [], sessions: [], questions: [] };
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
    // session = { subject, date, duration, startTime, endTime }
    const data = getData();
    data.sessions.push(session);
    saveData(data);
    return data.sessions;
}

export function getSessionsByPeriod(startDate, endDate) {
    const sessions = getSessions();
    return sessions.filter((s) => {
        const d = new Date(s.date);
        return d >= startDate && d <= endDate;
    });
}

export function getSessionsBySubject(subject) {
    return getSessions().filter((s) => s.subject === subject);
}

// ===== Questões =====
export function getQuestions() {
    return getData().questions;
}

export function saveQuestionEntry(entry) {
    // entry = { subject, date, total, correct }
    const data = getData();
    data.questions.push({ ...entry, wrong: entry.total - entry.correct });
    saveData(data);
    return data.questions;
}

// ===== Estatísticas =====
export function getStats() {
    const sessions = getSessions();
    const questions = getQuestions();

    // Total de horas
    const totalSeconds = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);
    const totalHours = totalSeconds / 3600;

    // Dias únicos estudados
    const uniqueDays = new Set(sessions.map((s) => s.date?.split('T')[0]));
    const daysCount = uniqueDays.size || 1;

    // Média diária
    const dailyAvgHours = totalHours / daysCount;

    // Semanas
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

    // Questões totais
    const totalQuestions = questions.reduce((acc, q) => acc + q.total, 0);
    const totalCorrect = questions.reduce((acc, q) => acc + q.correct, 0);
    const totalWrong = totalQuestions - totalCorrect;
    const accuracy = totalQuestions > 0 ? ((totalCorrect / totalQuestions) * 100).toFixed(1) : 0;

    // Questões por matéria
    const questionsBySubject = {};
    questions.forEach((q) => {
        if (!questionsBySubject[q.subject]) questionsBySubject[q.subject] = { total: 0, correct: 0, wrong: 0 };
        questionsBySubject[q.subject].total += q.total;
        questionsBySubject[q.subject].correct += q.correct;
        questionsBySubject[q.subject].wrong += q.total - q.correct;
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

    return {
        totalHours,
        totalSessions: sessions.length,
        dailyAvgHours,
        weeklyAvgHours,
        subjectMap,
        totalQuestions,
        totalCorrect,
        totalWrong,
        accuracy,
        questionsBySubject,
        last7
    };
}

import express from 'express';
import fetch from 'node-fetch';
import { clerkAuth } from '../middleware/auth.js';

const router = express.Router();

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001/api';

function formatMorningBrief(events, emailSummary, tasks) {
    return `Good morning!\n\nToday's Calendar:\n${events.map(e => `- ${e.time || e.start?.dateTime || e.start?.date || 'All Day'}: ${e.title || e.summary || e.description || '(No Title)'}`).join('\n')}\n\nEmail Summary:\n${emailSummary.summary || emailSummary}\n\nTop Tasks:\n${tasks.map(t => `- ${t.title} (${t.due || t.dueDate || 'No Due Date'})`).join('\n')}`;
}

function formatEndOfDayRecap(completed, pending) {
    return `End of Day Recap:\n\nCompleted Tasks/Meetings:\n${completed.map(c => `- ${c}`).join('\n')}\n\nPending for Tomorrow:\n${pending.map(p => `- ${p}`).join('\n')}`;
}

async function fetchWithAuth(url, token) {
    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.json();
}

router.post('/morning-brief', clerkAuth, async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) throw new Error('No auth token');

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const calendarUrl = `${API_BASE}/calendar/events?timeMin=${today.toISOString()}&timeMax=${tomorrow.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=15`;
        const eventsData = await fetchWithAuth(calendarUrl, token);
        const events = eventsData.items || [];
        const emailSummary = await fetchWithAuth(`${API_BASE}/email/summary`, token);

        const tasksData = await fetchWithAuth(`${API_BASE}/tasks`, token);
        const todayStr = today.toISOString().slice(0, 10);
        const tasks = (tasksData || []).filter(t => t.due && t.due.startsWith(todayStr));

        const zapierWebhookUrl = req.body.zapierWebhookUrl || 'https://hooks.zapier.com/hooks/catch/your-zap-id';
        const userEmail = req.body.email || 'user@example.com';

        const message = formatMorningBrief(events, emailSummary, tasks);
        await fetch(zapierWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, email: userEmail }),
        });
        res.status(200).json({ message: 'Morning Brief job processed and sent to Zapier.' });
    } catch (error) {
        console.error('Error processing Morning Brief job:', error);
        res.status(500).json({ error: 'Failed to process Morning Brief job' });
    }
});

router.post('/end-of-day-recap', clerkAuth, async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) throw new Error('No auth token');

        const tasksData = await fetchWithAuth(`${API_BASE}/tasks`, token);
        const todayStr = new Date().toISOString().slice(0, 10);
        const completed = (tasksData || []).filter(t => t.status === 'completed' && t.completed && t.completed.startsWith(todayStr)).map(t => t.title);
        const pending = (tasksData || []).filter(t => t.status !== 'completed' && t.due && t.due > todayStr).map(t => t.title);

        const zapierWebhookUrl = req.body.zapierWebhookUrl || 'https://hooks.zapier.com/hooks/catch/your-zap-id';
        const userEmail = req.body.email || 'user@example.com';

        const message = formatEndOfDayRecap(completed, pending);
        await fetch(zapierWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, email: userEmail }),
        });
        res.status(200).json({ message: 'End-of-Day Recap job processed and sent to Zapier.' });
    } catch (error) {
        console.error('Error processing End-of-Day Recap job:', error);
        res.status(500).json({ error: 'Failed to process End-of-Day Recap job' });
    }
});

export default router;

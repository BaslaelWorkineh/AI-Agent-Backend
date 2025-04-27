import express from 'express';
import fetch from 'node-fetch';
import { google } from 'googleapis';
import { clerkAuth, getGoogleClientWithClerkToken } from '../middleware/auth.js';

const router = express.Router();

async function fetchTodaysCalendarEvents(client) {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const result = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 15,
    });
    return (result.data.items || []).map(e => ({
        time: e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'All Day',
        title: e.summary || '(No Title)'
    }));
}

async function fetchEmailSummary(client) {
    const gmail = google.gmail({ version: 'v1', auth: client });
    const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 5,
    });
    if (!listRes.data.messages || listRes.data.messages.length === 0) {
        return 'No unread messages found.';
    }
    const emailPromises = listRes.data.messages.map((message) =>
        gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From'],
        })
    );
    const emailResponses = await Promise.all(emailPromises);
    const emails = emailResponses.map((res) => res.data);
    if (emails.length === 1) {
        const headers = emails[0].payload.headers;
        const subject = headers.find((h) => h.name === 'Subject')?.value || '(No Subject)';
        const from = headers.find((h) => h.name === 'From')?.value || '(Unknown Sender)';
        return `You have 1 unread email: "${subject}" from ${from}.`;
    } else {
        let summary = `You have ${emails.length} unread emails.\n`;
        summary += emails.map((email, idx) => {
            const headers = email.payload.headers;
            const subject = headers.find((h) => h.name === 'Subject')?.value || '(No Subject)';
            const from = headers.find((h) => h.name === 'From')?.value || '(Unknown Sender)';
            return `${idx + 1}. "${subject}" from ${from}`;
        }).join('\n');
        return summary;
    }
}

async function fetchTodaysTasks(client) {
    const tasksApi = google.tasks({ version: 'v1', auth: client });
    const taskLists = await tasksApi.tasklists.list({ maxResults: 1 });
    if (!taskLists.data.items || taskLists.data.items.length === 0) return [];
    const defaultTaskListId = taskLists.data.items[0].id;
    const result = await tasksApi.tasks.list({
        tasklist: defaultTaskListId,
        showCompleted: false,
        maxResults: 20,
    });
    const today = new Date().toISOString().slice(0, 10);
    return (result.data.items || []).filter(t => t.due && t.due.startsWith(today)).map(t => ({
        title: t.title,
        due: t.due ? 'Today' : 'No Due Date',
    }));
}

async function fetchCompletedAndPendingTasks(client) {
    const tasksApi = google.tasks({ version: 'v1', auth: client });
    const taskLists = await tasksApi.tasklists.list({ maxResults: 1 });
    if (!taskLists.data.items || taskLists.data.items.length === 0) return { completed: [], pending: [] };
    const defaultTaskListId = taskLists.data.items[0].id;
    const result = await tasksApi.tasks.list({
        tasklist: defaultTaskListId,
        showCompleted: true,
        maxResults: 50,
    });
    const today = new Date().toISOString().slice(0, 10);
    const completed = (result.data.items || []).filter(t => t.status === 'completed' && t.completed && t.completed.startsWith(today)).map(t => t.title);
    const pending = (result.data.items || []).filter(t => t.status !== 'completed' && t.due && t.due > today).map(t => t.title);
    return { completed, pending };
}

function formatMorningBrief(events, emailSummary, tasks) {
    return `Good morning!\n\nToday's Calendar:\n${events.map(e => `- ${e.time}: ${e.title}`).join('\n')}\n\nEmail Summary:\n${emailSummary}\n\nTop Tasks:\n${tasks.map(t => `- ${t.title} (${t.due})`).join('\n')}`;
}

function formatEndOfDayRecap(completed, pending) {
    return `End of Day Recap:\n\nCompleted Tasks/Meetings:\n${completed.map(c => `- ${c}`).join('\n')}\n\nPending for Tomorrow:\n${pending.map(p => `- ${p}`).join('\n')}`;
}

router.post('/morning-brief', clerkAuth, async (req, res) => {
    try {
        const client = await getGoogleClientWithClerkToken(req);
        const [events, emailSummary, tasks] = await Promise.all([
            fetchTodaysCalendarEvents(client),
            fetchEmailSummary(client),
            fetchTodaysTasks(client),
        ]);

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
        const client = await getGoogleClientWithClerkToken(req);

        const { completed, pending } = await fetchCompletedAndPendingTasks(client);

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

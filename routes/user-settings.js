import express from 'express';
import db from '../db.js';
import { clerkAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/', clerkAuth, (req, res) => {
    const userId = req.auth.userId;
    const { zapierWebhookUrl, email } = req.body;
    if (!zapierWebhookUrl || !email) {
        return res.status(400).json({ error: 'zapierWebhookUrl and email are required' });
    }
    try {
        db.prepare(`INSERT INTO user_settings (user_id, zapier_webhook_url, email)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET zapier_webhook_url=excluded.zapier_webhook_url, email=excluded.email;`)
            .run(userId, zapierWebhookUrl, email);
        res.status(200).json({ message: 'Settings saved' });
    } catch (err) {
        console.error('Error saving user settings:', err);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

router.get('/', clerkAuth, (req, res) => {
    const userId = req.auth.userId;
    try {
        const row = db.prepare('SELECT zapier_webhook_url, email FROM user_settings WHERE user_id = ?').get(userId);
        res.status(200).json(row || {});
    } catch (err) {
        console.error('Error fetching user settings:', err);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

export default router;

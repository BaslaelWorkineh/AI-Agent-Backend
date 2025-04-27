import express from 'express';
import cors from 'cors';

import { config } from './config/env.js';

import calendarRoutes from './routes/calendar.js';
import emailRoutes from './routes/email.js';
import tasksRoutes from './routes/tasks.js';
import commandRoutes from './routes/command.js';
import jobRoutes from './routes/jobs.js';
import userSettingsRoutes from './routes/user-settings.js';

const app = express();

app.use(cors({
    origin: config.frontendUrl, 
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Backend is running' });
});

app.use('/api/calendar', calendarRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/command', commandRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/user-settings', userSettingsRoutes);

app.use((err, req, res, next) => {
    console.error("Global Error Handler:", err.stack);
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Internal Server Error',
            stack: config.nodeEnv === 'development' ? err.stack : undefined,
        },
    });
});

app.listen(config.port, () => {
  console.log(`Backend server listening on port ${config.port} in ${config.nodeEnv} mode`);
});

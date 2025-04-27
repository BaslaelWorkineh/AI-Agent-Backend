import dotenv from 'dotenv';

dotenv.config();

export const config = {
    port: process.env.PORT || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8080',

    geminiApiKey: process.env.GEMINI_API_KEY,

    clerkSecretKey: process.env.CLERK_SECRET_KEY,
};

if (!config.clerkSecretKey) {
    console.error('FATAL ERROR: Missing CLERK_SECRET_KEY in .env file.');
    // process.exit(1); // Optionally exit if critical config is missing
}

if (!config.geminiApiKey) {
    console.warn('Warning: GEMINI_API_KEY not found in .env file. Gemini features will be disabled.');
}

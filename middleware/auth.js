import { ClerkExpressRequireAuth, clerkClient } from '@clerk/clerk-sdk-node';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env.js';

export const clerkAuth = ClerkExpressRequireAuth({});

export const getGoogleClientWithClerkToken = async (req) => {
    if (!req.auth || !req.auth.userId) {
        throw new Error('Clerk authentication object not found or invalid.');
    }
    try {
        // Get the Google OAuth access token using Clerk's new method
        const tokens = await clerkClient.users.getUserOauthAccessToken(req.auth.userId, 'google');
        const googleAccessToken = tokens[0]?.token;
        console.log('Google access token from Clerk:', googleAccessToken);
        if (!googleAccessToken) {
            throw new Error('Google OAuth access token not found for the user. Ensure Google provider is configured in Clerk, user is connected, and access token storage is enabled.');
        }
        const client = new OAuth2Client(config.googleClientId, config.googleClientSecret);
        client.setCredentials({ access_token: googleAccessToken });
        return client;
    } catch (error) {
        console.error("Error getting Google access token via Clerk:", error);
        throw new Error('Failed to retrieve Google OAuth access token via Clerk.');
    }
};
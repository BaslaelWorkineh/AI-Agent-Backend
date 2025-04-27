import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './env.js';

let genAIInstance;
let geminiModelInstance;

if (config.geminiApiKey) {
  try {
    genAIInstance = new GoogleGenerativeAI(config.geminiApiKey);
    geminiModelInstance = genAIInstance.getGenerativeModel({ model: "gemini-2.0-flash" });
    console.log('Gemini client initialized successfully.');
  } catch (error) {
    console.error('Error initializing Gemini client:', error);
  }
} else {
  console.warn('Gemini API Key not provided. Gemini features disabled.');
}

export const genAI = genAIInstance;
export const geminiModel = geminiModelInstance;

import express from "express";
import { geminiModel } from "../config/google.js";

const router = express.Router();

function promptTemplate(userInput) {
  const today = new Date();
  const todayString = today.toISOString().split("T")[0];
  return `
  The current date is ${today.toDateString()}.
  You are an AI Executive Assistant.

  Given the following user input, identify the INTENT and the DETAILS needed.

  You MUST select the intent from the following list ONLY:
  - schedule_meeting
  - create_task
  - complete_task
  - summarize_email
  - draft_email

  For all date/time fields (like start, end, due), always output in RFC3339 format (e.g., 2025-04-27T15:00:00.000Z). If you only know the date, use YYYY-MM-DD.

  If the intent is "summarize_email" or "draft_email":
  - Use fields like: pageSize, pageToken (for summarize_email)
  - Or fields like: to, subject, body (for draft_email)

  If the intent is "create_task":
  - Use fields like: title, notes, due

  If the intent is "complete_task":
  - Use fields like: taskId

  If the intent is "schedule_meeting":
  - Use fields like: summary, description, start, end, attendees, location

  Format your output strictly as JSON:
  {
    "intent": "...",   // one of the allowed intents
    "details": { ... } // key information extracted from the input
  }

  ONLY output valid JSON. Do not explain.

  Input: "${userInput}"
  Output:
`;
}

// Parse Gemini's response for JSON
function extractJson(text) {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1)
    throw new Error("No JSON found in Gemini response");
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
}

async function summarizeWithGemini(
  context,
  instruction = "Summarize the following in a short even if you dont have enough data summarize with what you have, user-friendly paragraph:"
) {
  if (!geminiModel) return context;
  const prompt = `${instruction}\n\nContext:\n${
    typeof context === "string" ? context : JSON.stringify(context)
  }\n\nSummary:`;
  const result = await geminiModel.generateContent(prompt);
  const response = await result.response;
  return (await response.text()).trim();
}

router.post("/", async (req, res) => {
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ error: "Command is required" });
  }

  if (!geminiModel) {
    console.error("Gemini model not initialized. Check API key.");
    return res.status(503).json({
      message: "Processing command (Gemini unavailable)",
      details: `Received command: ${command}. Gemini integration is disabled.`,
    });
  }

  try {

    const prompt = promptTemplate(command);
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();
    let intent, details;
    try {
      ({ intent, details } = extractJson(text));
    } catch (err) {
      console.error("Gemini response not valid JSON:", text);
      return res
        .status(400)
        .json({ error: "Gemini did not return valid JSON", geminiRaw: text });
    }

    console.log("Gemini intent:", intent);
    console.log("Gemini details:", details);

    const fetch = (await import("node-fetch")).default;
    const apiBase = process.env.API_BASE_URL || "http://localhost:3001/api";
    switch (intent) {
      case "schedule_meeting": {
        const response = await fetch(`${apiBase}/calendar/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: req.headers.authorization || "",
          },
          body: JSON.stringify(details),
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);
        const summary = await summarizeWithGemini(
          data.event || data,
          "Summarize the following meeting details in a short, user-friendly paragraph:"
        );
        return res.json({ result: summary, event: data.event });
      }
      case "create_task": {
        const response = await fetch(`${apiBase}/tasks/add`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: req.headers.authorization || "",
          },
          body: JSON.stringify(details),
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);
        const summary = await summarizeWithGemini(
          data,
          "Summarize the following task in a short, user-friendly paragraph:"
        );
        return res.json({ result: summary, task: data });
      }
      case "complete_task": {
        const { taskId } = details;
        if (!taskId)
          return res
            .status(400)
            .json({ error: "Missing taskId for complete_task" });
        const response = await fetch(`${apiBase}/tasks/${taskId}/complete`, {
          method: "PATCH",
          headers: {
            Authorization: req.headers.authorization || "",
          },
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);
        const summary = await summarizeWithGemini(
          data,
          "Summarize the following completed task in a short, user-friendly paragraph:"
        );
        return res.json({ result: summary, task: data });
      }
      case "summarize_email": {
        const response = await fetch(`${apiBase}/email/summary`, {
          method: "GET",
          headers: {
            Authorization: req.headers.authorization || "",
          },
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);
        const summary = await summarizeWithGemini(
          data.summary,
          "Summarize the following email summary in a short, user-friendly paragraph:"
        );
        return res.json({ result: summary, emails: data.emails });
      }
      case "draft_email": {
        const response = await fetch(`${apiBase}/email/draft`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: req.headers.authorization || "",
          },
          body: JSON.stringify(details),
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);
        const summary = await summarizeWithGemini(
          data.draft || data,
          "Summarize the following email draft in a short, user-friendly paragraph:"
        );
        return res.json({ result: summary, draft: data.draft });
      }
      default:
        return res
          .status(400)
          .json({ error: "Unknown intent", intent, details });
    }
  } catch (error) {
    console.error("Error processing command with Gemini:", error);
    res.status(500).json({ error: "Failed to process command using AI" });
  }
});

export default router;

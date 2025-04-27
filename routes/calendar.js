import {
  clerkAuth,
  getGoogleClientWithClerkToken,
} from "../middleware/auth.js";
import express from "express";
import { google } from "googleapis";

const router = express.Router();

router.get("/events", clerkAuth, async (req, res) => {
  try {
    const client = await getGoogleClientWithClerkToken(req);
    const calendar = google.calendar({ version: "v3", auth: client });

    const { timeMin, timeMax, singleEvents, orderBy, maxResults } = req.query;
    const result = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: singleEvents === "true",
      orderBy: orderBy || "startTime",
      maxResults: maxResults ? parseInt(maxResults) : 15,
    });

    res.status(200).json({ items: result.data.items || [] });
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    res.status(500).json({ error: "Failed to fetch calendar events" });
  }
});

router.post("/events", clerkAuth, async (req, res) => {
  try {
    const client = await getGoogleClientWithClerkToken(req);
    const calendar = google.calendar({ version: "v3", auth: client });
    let { summary, description, start, end, attendees, location } = req.body;

    const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    const isRFC3339 = (v) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v);
    let startRFC3339 = undefined;
    if (start) {
      if (isDate(start)) {
        startRFC3339 = `${start}T00:00:00.000Z`;
      } else if (isRFC3339(start)) {
        startRFC3339 = start;
      } else {
        return res
          .status(400)
          .json({
            error:
              "Start time must be in YYYY-MM-DD or RFC3339 format (e.g., 2025-04-27T15:00:00.000Z)",
          });
      }
    }
    let endRFC3339 = undefined;
    if (end) {
      if (isDate(end)) {
        endRFC3339 = `${end}T00:00:00.000Z`;
      } else if (isRFC3339(end)) {
        endRFC3339 = end;
      } else {
        return res
          .status(400)
          .json({
            error:
              "End time must be in YYYY-MM-DD or RFC3339 format (e.g., 2025-04-27T16:00:00.000Z)",
          });
      }
    }

    if (!endRFC3339 && startRFC3339 && isRFC3339(startRFC3339)) {
      endRFC3339 = new Date(
        new Date(startRFC3339).getTime() + 60 * 60 * 1000
      ).toISOString();
    }
    
    let attendeeObjs = [];
    if (Array.isArray(attendees)) {
      attendeeObjs = attendees
        .map((a) => {
          if (typeof a === "object" && a.email) return a;
          if (typeof a === "string" && a.includes("@")) return { email: a };
          return null;
        })
        .filter(Boolean);
    }
    const event = {
      summary,
      description,
      start: startRFC3339 ? { dateTime: startRFC3339 } : undefined,
      end: endRFC3339 ? { dateTime: endRFC3339 } : undefined,
      attendees: attendeeObjs.length > 0 ? attendeeObjs : undefined,
      location,
    };
    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });
    res.status(201).json({ event: response.data });
  } catch (error) {
    console.error("Error scheduling meeting:", error);
    res.status(500).json({ error: "Failed to schedule meeting" });
  }
});

export default router;

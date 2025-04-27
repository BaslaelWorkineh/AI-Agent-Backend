import {
  clerkAuth,
  getGoogleClientWithClerkToken,
} from "../middleware/auth.js";
import express from "express";
import { google } from "googleapis";

const router = express.Router();

router.get("/summary", clerkAuth, async (req, res) => {
  try {
    const client = await getGoogleClientWithClerkToken(req);
    const gmail = google.gmail({ version: "v1", auth: client });

    const pageSize = parseInt(req.query.pageSize) || 10;
    const pageToken = req.query.pageToken || undefined;

    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: "is:unread",
      maxResults: pageSize,
      pageToken,
    });

    if (!listRes.data.messages || listRes.data.messages.length === 0) {
      return res.json({
        summary: "No unread messages found.",
        emails: [],
        nextPageToken: null,
      });
    }

    const emailPromises = listRes.data.messages.map((message) =>
      gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      })
    );

    const emailResponses = await Promise.all(emailPromises);
    const emails = emailResponses.map((res) => res.data);

    let summary = "";
    if (emails.length === 1) {
      const headers = emails[0].payload.headers;
      const subject =
        headers.find((h) => h.name === "Subject")?.value || "(No Subject)";
      const from =
        headers.find((h) => h.name === "From")?.value || "(Unknown Sender)";
      summary = `You have 1 unread email: "${subject}" from ${from}.`;
    } else {
      summary = `You have ${emails.length} unread emails.\n`;
      summary += emails
        .map((email, idx) => {
          const headers = email.payload.headers;
          const subject =
            headers.find((h) => h.name === "Subject")?.value || "(No Subject)";
          const from =
            headers.find((h) => h.name === "From")?.value || "(Unknown Sender)";
          return `${idx + 1}. "${subject}" from ${from}`;
        })
        .join("\n");
    }
    res.json({
      summary,
      emails,
      nextPageToken: listRes.data.nextPageToken || null,
    });
  } catch (error) {
    console.error("Error fetching email summary:", error);
    res.status(500).json({ error: "Failed to fetch email summary" });
  }
});

router.post("/draft", clerkAuth, async (req, res) => {
  try {
    const client = await getGoogleClientWithClerkToken(req);
    const gmail = google.gmail({ version: "v1", auth: client });
    const { to, subject, body } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ error: "Missing to, subject, or body" });
    }

    const messageParts = [
      `To: ${to}`,
      "Content-Type: text/html; charset=utf-8",
      "MIME-Version: 1.0",
      `Subject: ${subject}`,
      "",
      body,
    ];
    const rawMessage = Buffer.from(messageParts.join("\n"))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
      
    const draftRes = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw: rawMessage,
        },
      },
    });
    res.status(201).json({ draft: draftRes.data });
  } catch (error) {
    console.error("Error creating draft:", error);
    res.status(500).json({ error: "Failed to create draft" });
  }
});

export default router;

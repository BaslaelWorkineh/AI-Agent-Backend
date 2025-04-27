import {
  clerkAuth,
  getGoogleClientWithClerkToken,
} from "../middleware/auth.js";
import express from "express";
import { google } from "googleapis";

const router = express.Router();

router.get("/", clerkAuth, async (req, res) => {
  try {
    const client = await getGoogleClientWithClerkToken(req);
    const tasksApi = google.tasks({ version: "v1", auth: client });

    
    const taskLists = await tasksApi.tasklists.list({ maxResults: 1 });
    if (!taskLists.data.items || taskLists.data.items.length === 0) {
      return res.json([]); 
    }
    const defaultTaskListId = taskLists.data.items[0].id;

    const result = await tasksApi.tasks.list({
      tasklist: defaultTaskListId,
      showCompleted: false,
      maxResults: 20,
    });

    res.json(result.data.items || []);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

router.post("/add", clerkAuth, async (req, res) => {
  try {
    const client = await getGoogleClientWithClerkToken(req);
    const tasksApi = google.tasks({ version: "v1", auth: client });
    const { title, notes, due } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Task title is required" });
    }
    
    const taskLists = await tasksApi.tasklists.list({ maxResults: 1 });
    if (!taskLists.data.items || taskLists.data.items.length === 0) {
      return res.status(400).json({ error: "No task list found" });
    }
    const defaultTaskListId = taskLists.data.items[0].id;

    let dueRFC3339 = due;
    if (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) {
      dueRFC3339 = `${due}T00:00:00.000Z`;
    }

    const result = await tasksApi.tasks.insert({
      tasklist: defaultTaskListId,
      requestBody: {
        title,
        notes,
        due: dueRFC3339,
      },
    });
    res.status(201).json(result.data);
  } catch (error) {
    console.error("Error adding task:", error);
    res.status(500).json({ error: "Failed to add task" });
  }
});

router.patch("/:taskId/complete", clerkAuth, async (req, res) => {
  try {
    const client = await getGoogleClientWithClerkToken(req);
    const tasksApi = google.tasks({ version: "v1", auth: client });
    const { taskId } = req.params;

    const taskLists = await tasksApi.tasklists.list({ maxResults: 1 });
    if (!taskLists.data.items || taskLists.data.items.length === 0) {
      return res.status(400).json({ error: "No task list found" });
    }
    const defaultTaskListId = taskLists.data.items[0].id;
    
    const result = await tasksApi.tasks.patch({
      tasklist: defaultTaskListId,
      task: taskId,
      requestBody: { status: "completed" },
    });
    res.json(result.data);
  } catch (error) {
    console.error("Error completing task:", error);
    res.status(500).json({ error: "Failed to complete task" });
  }
});

export default router;

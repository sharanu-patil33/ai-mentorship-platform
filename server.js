// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { startInterview, handleAnswer, generateSummary, generateQuestion } from "./interview/interviewEngine.js";
import { rebuildState } from "./interview/stateManager.js";

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Create a student and start their interview
app.post("/api/interview/start", async (req, res) => {
  try {
    const { name, email, knownTopics } = req.body;

    if (!name || !email || !Array.isArray(knownTopics) || knownTopics.length === 0) {
      return res.status(400).json({ error: "name, email, and knownTopics (non-empty array) are required" });
    }

    const { data: student, error } = await supabase
      .from("students")
      .insert({ name, email, known_topics: knownTopics })
      .select()
      .single();

    if (error) throw error;

    const { state, question } = await startInterview(student.id, knownTopics);

    res.json({
      studentId: student.id,
      sessionId: state.sessionId,
      topic: state.topics[state.currentTopicIndex].name,
      question,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Submit an answer, get the next question (or the final summary if done)
app.post("/api/interview/answer", async (req, res) => {
  try {
    const { sessionId, question, answer } = req.body;

    if (!sessionId || !question || !answer) {
      return res.status(400).json({ error: "sessionId, question, and answer are required" });
    }

    const state = await rebuildState(sessionId);
    const result = await handleAnswer(state, question, answer);

    if (result.done) {
      const summary = await generateSummary(state);
      return res.json({ done: true, summary });
    }

    res.json({ done: false, question: result.question, topic: result.topic });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Resume an interview after a refresh — returns current question or final summary
app.get("/api/interview/:sessionId/current", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const state = await rebuildState(sessionId);

    if (state.isComplete) {
      const { data: existingSummary } = await supabase
        .from("interview_summary")
        .select("*")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (existingSummary) {
        return res.json({ done: true, summary: existingSummary });
      }
      const summary = await generateSummary(state);
      return res.json({ done: true, summary });
    }

    const question = await generateQuestion(state, state.lastAnswer);
    res.json({ done: false, question, topic: state.topics[state.currentTopicIndex].name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
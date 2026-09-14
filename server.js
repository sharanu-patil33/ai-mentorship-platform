// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { startInterview, handleAnswer, generateSummary, generateQuestion, recommendPrograms } from "./interview/interviewEngine.js";
import { rebuildState } from "./interview/stateManager.js";

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Create a student and start their interview (also supports an already-logged-in student)
app.post("/api/interview/start", async (req, res) => {
  try {
    const { name, email, knownTopics, studentId } = req.body;

    if (!Array.isArray(knownTopics) || knownTopics.length === 0) {
      return res.status(400).json({ error: "knownTopics (non-empty array) is required" });
    }

    let student;

    if (studentId) {
      // Logged-in student — update their known_topics and reuse the existing record
      const { data: updated, error } = await supabase
        .from("students")
        .update({ known_topics: knownTopics })
        .eq("id", studentId)
        .select()
        .single();

      if (error) throw error;
      student = updated;
    } else {
      // Legacy path — no login, create a fresh student record
      if (!name || !email) {
        return res.status(400).json({ error: "name and email are required when not logged in" });
      }

      const { data: created, error } = await supabase
        .from("students")
        .insert({ name, email, known_topics: knownTopics })
        .select()
        .single();

      if (error) throw error;
      student = created;
    }

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

// Get recommended programs based on a completed interview's summary
app.get("/api/interview/:sessionId/recommend-programs", async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data: summaryRow, error } = await supabase
      .from("interview_summary")
      .select("*")
      .eq("session_id", sessionId)
      .single();

    if (error || !summaryRow) {
      return res.status(404).json({ error: "No summary found for this session yet" });
    }

    const { allPrograms, recommended, reasoning } = await recommendPrograms(summaryRow);

    res.json({
      programs: allPrograms.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        concepts: p.concepts,
        recommended: recommended.includes(p.name),
      })),
      reasoning,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Student selects 2 programs (recommended or self-selected) — seeds concept_progress
app.post("/api/student/:studentId/select-programs", async (req, res) => {
  try {
    const { studentId } = req.params;
    const { selections } = req.body; // [{ programId, source: 'recommended' | 'self_selected' }, ...]

    if (!Array.isArray(selections) || selections.length !== 2) {
      return res.status(400).json({ error: "Exactly 2 program selections are required" });
    }

    // Idempotency guard: if this student already has programs selected, don't create duplicates
    const { data: existing, error: existingError } = await supabase
      .from("student_programs")
      .select("*, programs(name)")
      .eq("student_id", studentId);

    if (existingError) throw existingError;

    if (existing && existing.length > 0) {
      return res.status(409).json({
        error: "Programs already selected for this student",
        selections: existing.map((sp) => ({ program: sp.programs.name, studentProgramId: sp.id })),
      });
    }

    const results = [];

    for (const { programId, source } of selections) {
      const { data: program, error: programError } = await supabase
        .from("programs")
        .select("*")
        .eq("id", programId)
        .single();

      if (programError || !program) throw new Error("Program not found: " + programId);

      const { data: studentProgram, error: spError } = await supabase
        .from("student_programs")
        .insert({
          student_id: studentId,
          program_id: programId,
          source,
          status: "not_started",
        })
        .select()
        .single();

      if (spError) throw spError;

      // Seed concept_progress rows for every concept in this program
      const conceptRows = program.concepts.map((conceptName) => ({
        student_program_id: studentProgram.id,
        concept_name: conceptName,
        status: "not_started",
      }));

      const { error: cpError } = await supabase.from("concept_progress").insert(conceptRows);
      if (cpError) throw cpError;

      results.push({ program: program.name, studentProgramId: studentProgram.id });
    }

    res.json({ success: true, selections: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Mentor: search for a student by email, get their programs + concept progress
app.get("/api/mentor/student", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "email query param required" });

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("*")
      .eq("email", email)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const { data: studentPrograms, error: spError } = await supabase
      .from("student_programs")
      .select("*, programs(name, description)")
      .eq("student_id", student.id);

    if (spError) throw spError;

    const programsWithProgress = await Promise.all(
      studentPrograms.map(async (sp) => {
        const { data: concepts, error: cError } = await supabase
          .from("concept_progress")
          .select("*")
          .eq("student_program_id", sp.id)
          .order("id");

        if (cError) throw cError;

        return {
          studentProgramId: sp.id,
          programName: sp.programs.name,
          status: sp.status,
          source: sp.source,
          concepts,
        };
      })
    );

    res.json({ student, programs: programsWithProgress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Mentor: update a single concept's status/notes
app.patch("/api/mentor/concept-progress/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, mentorNotes, mentorId } = req.body;

    const updates = { updated_at: new Date() };
    if (status) updates.status = status;
    if (mentorNotes !== undefined) updates.mentor_notes = mentorNotes;
    if (mentorId) updates.marked_by = mentorId;

    const { data, error } = await supabase
      .from("concept_progress")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // If all concepts for this student_program are completed, mark the program completed
    const { data: allConcepts } = await supabase
      .from("concept_progress")
      .select("status")
      .eq("student_program_id", data.student_program_id);

    const allDone = allConcepts.every((c) => c.status === "completed");
    if (allDone) {
      await supabase
        .from("student_programs")
        .update({ status: "completed", completed_at: new Date() })
        .eq("id", data.student_program_id);
    }

    res.json({ success: true, concept: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Student: view their own programs + concept progress (read-only) — lookup by email
app.get("/api/student/dashboard", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "email query param required" });

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("*")
      .eq("email", email)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const { data: studentPrograms, error: spError } = await supabase
      .from("student_programs")
      .select("*, programs(name, description)")
      .eq("student_id", student.id);

    if (spError) throw spError;

    const programsWithProgress = await Promise.all(
      studentPrograms.map(async (sp) => {
        const { data: concepts, error: cError } = await supabase
          .from("concept_progress")
          .select("concept_name, status, mentor_notes, updated_at")
          .eq("student_program_id", sp.id)
          .order("id");

        if (cError) throw cError;

        const completedCount = concepts.filter((c) => c.status === "completed").length;

        return {
          programName: sp.programs.name,
          status: sp.status,
          source: sp.source,
          totalConcepts: concepts.length,
          completedConcepts: completedCount,
          concepts,
        };
      })
    );

    res.json({
      student: { id: student.id, name: student.name, email: student.email },
      programs: programsWithProgress,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Student: view their own programs + concept progress (read-only) — lookup by ID (used by the direct link after program selection)
app.get("/api/student/:studentId/dashboard", async (req, res) => {
  try {
    const { studentId } = req.params;

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("*")
      .eq("id", studentId)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const { data: studentPrograms, error: spError } = await supabase
      .from("student_programs")
      .select("*, programs(name, description)")
      .eq("student_id", studentId);

    if (spError) throw spError;

    const programsWithProgress = await Promise.all(
      studentPrograms.map(async (sp) => {
        const { data: concepts, error: cError } = await supabase
          .from("concept_progress")
          .select("concept_name, status, mentor_notes, updated_at")
          .eq("student_program_id", sp.id)
          .order("id");

        if (cError) throw cError;

        const completedCount = concepts.filter((c) => c.status === "completed").length;

        return {
          programName: sp.programs.name,
          status: sp.status,
          source: sp.source,
          totalConcepts: concepts.length,
          completedConcepts: completedCount,
          concepts,
        };
      })
    );

    res.json({ student: { name: student.name, email: student.email }, programs: programsWithProgress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Auth: ensure a students row exists for this authenticated user, return their studentId
app.post("/api/auth/sync-student", async (req, res) => {
  try {
    const { authUserId, email, name } = req.body;

    if (!authUserId || !email) {
      return res.status(400).json({ error: "authUserId and email are required" });
    }

    // Check if a student row already exists for this auth user
    const { data: existing, error: existingError } = await supabase
      .from("students")
      .select("*")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      return res.json({ student: existing, isNew: false });
    }

    // Create a new student row linked to this auth user
    const { data: newStudent, error: insertError } = await supabase
      .from("students")
      .insert({
        auth_user_id: authUserId,
        email,
        name: name || email.split("@")[0],
        known_topics: [],
      })
      .select()
      .single();

    if (insertError) throw insertError;

    res.json({ student: newStudent, isNew: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
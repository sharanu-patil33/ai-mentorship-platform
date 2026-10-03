// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { startInterview, handleAnswer, generateSummary, generatePhaseQuestion, recommendPrograms } from "./interview/interviewEngine.js";
import { startFinalInterview, handleFinalAnswer, generateFinalSummary } from "./interview/finalInterviewEngine.js";
import { rebuildState } from "./interview/stateManager.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.static("public"));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Create a student and start their interview
app.post("/api/interview/start", async (req, res) => {
  try {
    const { name, email, knownTopics, studentId } = req.body;

    if (!Array.isArray(knownTopics)) {
      return res.status(400).json({ error: "knownTopics must be an array" });
    }

    let student;

    if (studentId) {
      const { data: updated, error } = await supabase
        .from("students")
        .update({ known_topics: knownTopics })
        .eq("id", studentId)
        .select()
        .single();
      if (error) throw error;
      student = updated;
    } else {
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
      topic: state.phase || "introduction",
      question,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Submit an answer, get the next question or final summary
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

// Resume an interview after a refresh
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

    const question = await generatePhaseQuestion(state, state.lastAnswer);
    res.json({ done: false, question, topic: state.phase });
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

// Student selects 2 programs
app.post("/api/student/:studentId/select-programs", async (req, res) => {
  try {
    const { studentId } = req.params;
    const { selections } = req.body;

    if (!Array.isArray(selections) || selections.length !== 2) {
      return res.status(400).json({ error: "Exactly 2 program selections are required" });
    }

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
        .from("programs").select("*").eq("id", programId).single();

      if (programError || !program) throw new Error("Program not found: " + programId);

      const { data: studentProgram, error: spError } = await supabase
        .from("student_programs")
        .insert({ student_id: studentId, program_id: programId, source, status: "not_started" })
        .select().single();

      if (spError) throw spError;

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
      .from("students").select("*").eq("email", email).single();

    if (studentError || !student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const { data: studentPrograms, error: spError } = await supabase
      .from("student_programs").select("*, programs(name, description)").eq("student_id", student.id);

    if (spError) throw spError;

    const programsWithProgress = await Promise.all(
      studentPrograms.map(async (sp) => {
        const { data: concepts, error: cError } = await supabase
          .from("concept_progress").select("*").eq("student_program_id", sp.id).order("id");
        if (cError) throw cError;
        return { studentProgramId: sp.id, programName: sp.programs.name, status: sp.status, source: sp.source, concepts };
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
      .from("concept_progress").update(updates).eq("id", id).select().single();
    if (error) throw error;

    const { data: allConcepts } = await supabase
      .from("concept_progress").select("status").eq("student_program_id", data.student_program_id);

    const allDone = allConcepts.every((c) => c.status === "completed");
    if (allDone) {
      await supabase.from("student_programs")
        .update({ status: "completed", completed_at: new Date() }).eq("id", data.student_program_id);
    }

    res.json({ success: true, concept: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Student: view programs + concept progress by email
app.get("/api/student/dashboard", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "email query param required" });

    const { data: student, error: studentError } = await supabase
      .from("students").select("*").eq("email", email).single();

    if (studentError || !student) return res.status(404).json({ error: "Student not found" });

    const { data: studentPrograms } = await supabase
      .from("student_programs").select("*, programs(name, description)").eq("student_id", student.id);

    const programsWithProgress = await Promise.all(
      (studentPrograms || []).map(async (sp) => {
        const { data: concepts } = await supabase
          .from("concept_progress")
          .select("concept_name, status, mentor_notes, updated_at")
          .eq("student_program_id", sp.id).order("id");
        const completedCount = (concepts || []).filter((c) => c.status === "completed").length;
        return { studentProgramId: sp.id, programName: sp.programs.name, status: sp.status, source: sp.source, totalConcepts: (concepts || []).length, completedConcepts: completedCount, concepts: concepts || [] };
      })
    );

    res.json({ student: { id: student.id, name: student.name, email: student.email }, programs: programsWithProgress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Student: view programs + concept progress by ID
app.get("/api/student/:studentId/dashboard", async (req, res) => {
  try {
    const { studentId } = req.params;

    const { data: student, error: studentError } = await supabase
      .from("students").select("*").eq("id", studentId).single();

    if (studentError || !student) return res.status(404).json({ error: "Student not found" });

    const { data: studentPrograms } = await supabase
      .from("student_programs").select("*, programs(name, description)").eq("student_id", studentId);

    const programsWithProgress = await Promise.all(
      (studentPrograms || []).map(async (sp) => {
        const { data: concepts } = await supabase
          .from("concept_progress")
          .select("concept_name, status, mentor_notes, updated_at")
          .eq("student_program_id", sp.id).order("id");
        const completedCount = (concepts || []).filter((c) => c.status === "completed").length;
        return { studentProgramId: sp.id, programName: sp.programs.name, status: sp.status, source: sp.source, totalConcepts: (concepts || []).length, completedConcepts: completedCount, concepts: concepts || [] };
      })
    );

    res.json({ student: { name: student.name, email: student.email }, programs: programsWithProgress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Auth: sync student login
app.post("/api/auth/sync-student", async (req, res) => {
  try {
    const { authUserId, email, name } = req.body;
    if (!authUserId || !email) return res.status(400).json({ error: "authUserId and email are required" });

    const { data: existing, error: existingError } = await supabase
      .from("students").select("*").or(`auth_user_id.eq.${authUserId},email.eq.${email}`).maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      if (!existing.auth_user_id) {
        await supabase.from("students").update({ auth_user_id: authUserId }).eq("id", existing.id);
      }
      return res.json({ student: existing, isNew: false });
    }

    const { data: newStudent, error: insertError } = await supabase
      .from("students")
      .insert({ auth_user_id: authUserId, email, name: name || email.split("@")[0], known_topics: [] })
      .select().single();

    if (insertError) throw insertError;
    res.json({ student: newStudent, isNew: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Auth: sync mentor login
app.post("/api/auth/sync-mentor", async (req, res) => {
  try {
    const { authUserId, email } = req.body;
    if (!authUserId || !email) return res.status(400).json({ error: "authUserId and email are required" });

    const { data: mentor, error } = await supabase
      .from("mentors").select("*").eq("auth_user_id", authUserId).maybeSingle();

    if (error) throw error;
    if (!mentor) return res.status(403).json({ error: "No mentor account found for this email. Contact admin." });

    res.json({ mentor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Student: check interview status
app.get("/api/student/:studentId/interview-status", async (req, res) => {
  try {
    const { studentId } = req.params;

    const { data: session, error } = await supabase
      .from("interview_sessions").select("id, status")
      .eq("student_id", studentId).eq("status", "completed")
      .order("started_at", { ascending: false }).limit(1).maybeSingle();

    if (error) throw error;
    res.json({ hasCompletedInterview: !!session, sessionId: session ? session.id : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Mentor: get all students
app.get("/api/mentor/students", async (req, res) => {
  try {
    const { data: students, error } = await supabase
      .from("students").select("id, name, email, known_topics, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const studentsWithProgress = await Promise.all(
      students.map(async (student) => {
        const { data: programs } = await supabase
          .from("student_programs").select("id, status, source, programs(name)").eq("student_id", student.id);

        const { data: session } = await supabase
          .from("interview_sessions").select("id, status")
          .eq("student_id", student.id).eq("status", "completed").maybeSingle();

        return { ...student, hasInterview: !!session, programs: programs || [] };
      })
    );

    res.json({ students: studentsWithProgress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Project submissions (matches table: id, student_id, student_program_id, repo_url, pdf_path, pdf_name, status, mentor_feedback, reviewed_by) ----
const PDF_BUCKET = "project-pdfs";

// Adds student name/email, program name and a public PDF link to each submission row.
// Names come strictly from each row's own student_id.
async function attachDetails(rows) {
  const studentIds = [...new Set(rows.map((r) => r.student_id).filter(Boolean))];
  const spIds = [...new Set(rows.map((r) => r.student_program_id).filter(Boolean))];

  const { data: students } = studentIds.length
    ? await supabase.from("students").select("id, name, email").in("id", studentIds)
    : { data: [] };
  const { data: sps } = spIds.length
    ? await supabase.from("student_programs").select("id, programs(name)").in("id", spIds)
    : { data: [] };

  const studentMap = Object.fromEntries((students || []).map((s) => [s.id, s]));
  const spMap = Object.fromEntries((sps || []).map((s) => [s.id, s]));

  return rows.map((r) => ({
    ...r,
    students: studentMap[r.student_id] || null,
    student_programs: spMap[r.student_program_id] || null,
    pdf_url: r.pdf_path ? supabase.storage.from(PDF_BUCKET).getPublicUrl(r.pdf_path).data.publicUrl : null,
  }));
}

// Student: get project submissions
app.get("/api/student/:studentId/projects", async (req, res) => {
  try {
    const { studentId } = req.params;
    const { data, error } = await supabase
      .from("project_submissions")
      .select("*")
      .eq("student_id", studentId)
      .order("id", { ascending: false });

    if (error) throw error;
    res.json({ projects: await attachDetails(data || []) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Student: submit a project (repo URL + optional PDF)
app.post("/api/student/:studentId/submit-project", async (req, res) => {
  try {
    const { studentId } = req.params;
    const { studentProgramId, repoUrl, pdfName, pdfBase64 } = req.body;

    if (!studentProgramId || !repoUrl) {
      return res.status(400).json({ error: "studentProgramId and repoUrl are required" });
    }

    // The chosen program enrollment must belong to this student
    const { data: owned, error: ownedError } = await supabase
      .from("student_programs").select("id")
      .eq("id", studentProgramId).eq("student_id", studentId).maybeSingle();

    if (ownedError) throw ownedError;
    if (!owned) {
      return res.status(403).json({ error: "This program does not belong to the logged-in student. Please log in again." });
    }

    let pdfPath = null;
    let savedName = null;

    if (pdfBase64) {
      const buffer = Buffer.from(pdfBase64, "base64");
      if (buffer.length > 10 * 1024 * 1024) {
        return res.status(400).json({ error: "PDF must be 10 MB or smaller" });
      }
      if (buffer.subarray(0, 4).toString() !== "%PDF") {
        return res.status(400).json({ error: "File is not a valid PDF" });
      }
      savedName = String(pdfName || "project.pdf").replace(/[^\w.\-]/g, "_");
      pdfPath = `${studentId}/${Date.now()}_${savedName}`;

      const { error: uploadError } = await supabase.storage
        .from(PDF_BUCKET)
        .upload(pdfPath, buffer, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw uploadError;
    }

    const { data, error } = await supabase
      .from("project_submissions")
      .insert({
        student_id: studentId,
        student_program_id: studentProgramId,
        repo_url: repoUrl,
        pdf_path: pdfPath,
        pdf_name: savedName,
        status: "submitted",
      })
      .select().single();

    if (error) throw error;
    res.json({ success: true, project: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Mentor: get all project submissions (optional filters: ?studentId=  or  ?email=)
app.get("/api/mentor/submissions", async (req, res) => {
  try {
    const { studentId, email } = req.query;
    let studentFilterId = studentId || null;

    if (!studentFilterId && email) {
      const { data: st } = await supabase.from("students").select("id").eq("email", email).maybeSingle();
      if (!st) return res.json({ submissions: [] });
      studentFilterId = st.id;
    }

    let query = supabase.from("project_submissions").select("*").order("id", { ascending: false });
    if (studentFilterId) query = query.eq("student_id", studentFilterId);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ submissions: await attachDetails(data || []) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Mentor: update project submission status + feedback
app.patch("/api/mentor/submissions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, mentor_feedback, mentorId } = req.body;

    const updates = {};
    if (status) updates.status = status;
    if (mentor_feedback !== undefined) updates.mentor_feedback = mentor_feedback;
    if (mentorId) updates.reviewed_by = mentorId;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const { data, error } = await supabase
      .from("project_submissions").update(updates).eq("id", id).select().single();

    if (error) throw error;
    res.json({ success: true, submission: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Resume: generate PDF
app.post("/api/student/:studentId/generate-resume", async (req, res) => {
  try {
    const { studentId } = req.params;

    const { data: summary } = await supabase
      .from("interview_summary").select("id").eq("student_id", studentId).maybeSingle();

    if (!summary) {
      return res.status(400).json({ error: "No interview summary found. Complete the interview first." });
    }

    const { execSync } = await import("child_process");
    const { join, dirname } = await import("path");
    const { fileURLToPath } = await import("url");
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const scriptPath = join(__dirname, "resume_generator.py");

    const result = execSync(`python3 "${scriptPath}" "${studentId}"`, {
      env: { ...process.env },
      encoding: "utf8",
      timeout: 30000,
    });

    const parsed = JSON.parse(result.trim());
    if (parsed.error) throw new Error(parsed.error);

    await supabase.from("resumes").upsert({
      student_id: studentId,
      pdf_content: `/resumes/${studentId}.pdf`,
      updated_at: new Date(),
    }, { onConflict: "student_id" });

    res.json({ success: true, url: `/resumes/${studentId}.pdf` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Resume: get existing resume
app.get("/api/student/:studentId/resume", async (req, res) => {
  try {
    const { studentId } = req.params;
    const { data } = await supabase.from("resumes").select("*").eq("student_id", studentId).maybeSingle();
    if (!data) return res.json({ exists: false });
    res.json({ exists: true, url: data.pdf_content, generated_at: data.generated_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Final Interview endpoints
app.post("/api/final-interview/start", async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: "studentId required" });
    const result = await startFinalInterview(studentId);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.post("/api/final-interview/answer", async (req, res) => {
  try {
    const { sessionId, studentId, question, answer, turnNumber, context } = req.body;
    const result = await handleFinalAnswer(sessionId, studentId, question, answer, turnNumber, context);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.post("/api/final-interview/complete", async (req, res) => {
  try {
    const { sessionId, studentId } = req.body;
    const result = await generateFinalSummary(sessionId, studentId);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.get("/api/final-interview/:studentId/result", async (req, res) => {
  try {
    const { studentId } = req.params;
    const { data } = await supabase
      .from("final_interview_sessions").select("*")
      .eq("student_id", studentId).eq("status", "completed")
      .order("ended_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) return res.json({ exists: false });
    res.json({ exists: true, ...data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
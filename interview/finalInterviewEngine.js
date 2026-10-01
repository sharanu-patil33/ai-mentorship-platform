// interview/finalInterviewEngine.js
import "dotenv/config";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const MODEL = "openai/gpt-oss-120b";
const MAX_QUESTIONS = 10;

// ── 1. Load resume context ─────────────────────────────────────────────────
async function loadResumeContext(studentId) {
  // Get interview summary
  const { data: summary } = await supabase
    .from("interview_summary")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get projects
  const { data: projects } = await supabase
    .from("project_submissions")
    .select("*")
    .eq("student_id", studentId);

  // Get programs
  const { data: programs } = await supabase
    .from("student_programs")
    .select("*, programs(name)")
    .eq("student_id", studentId);

  const context = {
    skills: Object.keys(summary?.topic_scores || {}),
    strengths: summary?.strengths || [],
    projects: (projects || []).map(p => ({
      title: p.title,
      tech: p.tech_stack || [],
      description: p.description || "",
    })),
    programs: (programs || []).map(p => p.programs?.name).filter(Boolean),
    introduction: summary?.introduction || "",
    past_projects: summary?.past_projects || [],
  };

  return context;
}

// ── 2. Start final interview ───────────────────────────────────────────────
export async function startFinalInterview(studentId) {
  const { data: resume } = await supabase
    .from("resumes")
    .select("*")
    .eq("student_id", studentId)
    .maybeSingle();

  if (!resume) throw new Error("Please generate your resume first before the final interview.");

  const { data: session } = await supabase
    .from("final_interview_sessions")
    .insert({ student_id: studentId, resume_id: resume.id, status: "in_progress" })
    .select()
    .single();

  const context = await loadResumeContext(studentId);
  const question = await generateFinalQuestion(context, [], null);

  return { sessionId: session.id, question, context };
}

// ── 3. Generate question based on resume ──────────────────────────────────
export async function generateFinalQuestion(context, previousQAs, lastAnswer) {
  const resumeSummary = `
Student skills: ${context.skills.join(", ") || "General programming"}
Projects: ${context.projects.map(p => `${p.title} (${p.tech.join(", ")})`).join("; ") || context.past_projects.map(p => p.name).join("; ")}
Programs completed: ${context.programs.join(", ")}
Strengths: ${context.strengths.join(", ")}
`;

  const askedTopics = previousQAs.map(q => q.question).join(" | ");

  const systemPrompt = `You are a senior technical interviewer conducting a FINAL interview for a student based on their resume.
Ask ONE specific, probing question that tests their ACTUAL understanding of something on their resume.
Focus on: their specific projects (ask about implementation details, challenges, design decisions), 
their skills (ask to explain or demonstrate), or their program learnings.
Don't repeat topics already covered: ${askedTopics || "none yet"}.
Resume context: ${resumeSummary}
Respond ONLY with the question text, no preamble.`;

  const userPrompt = lastAnswer
    ? `Student's last answer: "${lastAnswer}"\nAsk the next resume-based question.`
    : `Start the final interview with a strong opening question about their most impressive project or skill.`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
  });

  return completion.choices[0].message.content.trim();
}

// ── 4. Score a final interview answer ─────────────────────────────────────
async function scoreFinalAnswer(question, answer, context) {
  const systemPrompt = `You evaluate a student's answer in their final interview.
Score their answer on: ${question}
Respond ONLY in JSON, no markdown: {"score": "weak"|"good"|"strong", "notes": "one constructive sentence"}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Answer: ${answer}` },
    ],
    temperature: 0.3,
  });

  const raw = completion.choices[0].message.content.trim().replace(/```json|```/g, "");
  try { return JSON.parse(raw); }
  catch { return { score: "good", notes: "Answer evaluated." }; }
}

// ── 5. Handle each answer ─────────────────────────────────────────────────
export async function handleFinalAnswer(sessionId, studentId, question, answer, turnNumber, context) {
  const evaluation = await scoreFinalAnswer(question, answer, context);

  await supabase.from("final_interview_qa").insert({
    session_id: sessionId,
    question,
    answer,
    score: evaluation.score,
    ai_notes: evaluation.notes,
    turn_number: turnNumber,
  });

  if (turnNumber >= MAX_QUESTIONS) {
    return { done: true };
  }

  const { data: qaLog } = await supabase
    .from("final_interview_qa")
    .select("question, answer")
    .eq("session_id", sessionId)
    .order("turn_number");

  const nextQuestion = await generateFinalQuestion(context, qaLog || [], answer);
  return { done: false, question: nextQuestion };
}

// ── 6. Generate final suggestions + job opportunities ─────────────────────
export async function generateFinalSummary(sessionId, studentId) {
  const { data: qaLog } = await supabase
    .from("final_interview_qa")
    .select("*")
    .eq("session_id", sessionId)
    .order("turn_number");

  const context = await loadResumeContext(studentId);
  const transcript = qaLog.map(q =>
    `Q: ${q.question}\nA: ${q.answer}\nScore: ${q.score}`
  ).join("\n\n");

  // Generate improvement suggestions
  const suggestionsRes = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: `Based on this final interview transcript, provide 3-5 specific, actionable improvement suggestions for the student.
Focus on what they can improve — communication, technical depth, project explanations.
Respond ONLY in JSON array, no markdown: ["suggestion 1", "suggestion 2", ...]` },
      { role: "user", content: transcript },
    ],
    temperature: 0.4,
  });

  let suggestions = [];
  try {
    const raw = suggestionsRes.choices[0].message.content.trim().replace(/```json|```/g, "");
    suggestions = JSON.parse(raw);
  } catch { suggestions = ["Continue practicing technical explanations.", "Work on articulating project architecture clearly.", "Deepen understanding of the technologies you've used."]; }

  // Generate job/internship opportunities based on their profile
  const jobsRes = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: `Based on the student's skills and programs, suggest 4 relevant internship/job opportunities.
Student skills: ${context.skills.join(", ")}
Programs: ${context.programs.join(", ")}
Respond ONLY in JSON array, no markdown:
[{"role": "Job Title", "type": "Internship|Full-time", "skills_needed": ["skill1","skill2"], "platforms": ["LinkedIn","Internshala"], "description": "one sentence"}]` },
      { role: "user", content: "Suggest relevant opportunities." },
    ],
    temperature: 0.5,
  });

  let jobOpportunities = [];
  try {
    const raw = jobsRes.choices[0].message.content.trim().replace(/```json|```/g, "");
    jobOpportunities = JSON.parse(raw);
  } catch { jobOpportunities = []; }

  // Save to DB
  await supabase.from("final_interview_sessions").update({
    status: "completed",
    suggestions,
    job_opportunities: jobOpportunities,
    ended_at: new Date(),
  }).eq("id", sessionId);

  return { suggestions, jobOpportunities };
}
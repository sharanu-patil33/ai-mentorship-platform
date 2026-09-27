// interview/interviewEngine.js
import "dotenv/config";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const MODEL = "openai/gpt-oss-120b";

const PHASE_LIMITS = {
  introduction: 3,
  projects: 4,
  hobbies: 2,
  technical: 4, // per topic
};
const MAX_TECHNICAL_TOTAL = 12;

// ─── 1. Start interview ───────────────────────────────────────────────────────
export async function startInterview(studentId, knownTopics = []) {
  const { data: session, error } = await supabase
    .from("interview_sessions")
    .insert({ student_id: studentId, status: "in_progress", mode: "mixed" })
    .select()
    .single();

  if (error) throw error;

  // If no topics provided, we'll extract them from the conversation during the technical phase
  const topicList = knownTopics.length > 0
    ? knownTopics
    : ["General Programming"]; // fallback until we extract from conversation

  const state = {
    sessionId: session.id,
    phase: "introduction",
    phaseQuestions: 0,
    topics: topicList.map(t => ({ name: t, questionsAsked: 0, scores: [] })),
    currentTopicIndex: 0,
    totalQuestions: 0,
  };

  const question = await generatePhaseQuestion(state, null);
  return { state, question };
}

// ─── 2. Generate question based on current phase ──────────────────────────────
export async function generatePhaseQuestion(state, lastAnswer) {
  let systemPrompt = "";
  let userPrompt = "";

  if (state.phase === "introduction") {
    systemPrompt = `You are a friendly interviewer doing a student onboarding.
Ask ONE warm, open-ended question to learn about the student's background, education, what they have studied, or what they are currently working on.
Respond ONLY with the question text, no preamble.`;
    userPrompt = lastAnswer
      ? `Student's previous answer: "${lastAnswer}"\nAsk a natural follow-up introduction question.`
      : `Ask an opening introduction question like "Tell me about yourself".`;

  } else if (state.phase === "projects") {
    systemPrompt = `You are a friendly interviewer learning about a student's past work.
Ask ONE specific question about their past projects — what they built, the tech stack they used, their role, or challenges they faced.
Respond ONLY with the question text, no preamble.`;
    userPrompt = lastAnswer
      ? `Student's previous answer: "${lastAnswer}"\nAsk a follow-up question about their projects or technical work.`
      : `Ask an opening question like "Tell me about a project you've worked on".`;

  } else if (state.phase === "hobbies") {
    systemPrompt = `You are a friendly interviewer learning about a student as a person.
Ask ONE warm question about their hobbies, interests outside tech, what motivates them, or their soft skills.
Respond ONLY with the question text, no preamble.`;
    userPrompt = lastAnswer
      ? `Student's previous answer: "${lastAnswer}"\nAsk a follow-up about their hobbies or interests.`
      : `Ask an opening question like "What do you enjoy doing outside of tech?".`;

  } else {
    // technical phase — if no topics seeded, use what student mentioned in projects
    let currentTopic = state.topics[state.currentTopicIndex];
    if (!currentTopic) {
      // fallback: ask general CS questions
      currentTopic = { name: "General Programming" };
    }
    systemPrompt = `You are a technical interviewer assessing a student's understanding of "${currentTopic.name}".
Ask ONE clear, specific technical question. Based on the student's previous answer, decide whether to:
- go deeper into the same concept (if their answer was strong)
- ask a simpler clarifying question (if their answer was weak or vague)
Respond ONLY with the question text, no preamble.`;
    userPrompt = lastAnswer
      ? `Previous answer: "${lastAnswer}"\nAsk the next technical question on ${currentTopic.name}.`
      : `Ask an opening technical question on ${currentTopic.name}.`;
  }

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

// ─── 3. Score a technical answer ──────────────────────────────────────────────
async function scoreAnswer(topic, question, answer) {
  const systemPrompt = `You evaluate a student's technical answer on "${topic}".
Respond ONLY in JSON, no markdown fences: {"depth": "basic"|"intermediate"|"advanced", "notes": "one short sentence"}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Question: ${question}\nAnswer: ${answer}` },
    ],
    temperature: 0.3,
  });

  const raw = completion.choices[0].message.content.trim().replace(/```json|```/g, "");
  try {
    return JSON.parse(raw);
  } catch {
    return { depth: "basic", notes: "Could not parse evaluation." };
  }
}

// ─── 4. Handle each answer turn ──────────────────────────────────────────────
export async function handleAnswer(state, question, answer) {
  const isTechnical = state.phase === "technical";
  const currentTopic = isTechnical ? state.topics[state.currentTopicIndex] : null;

  // Score technical answers; non-technical just log as-is
  const evaluation = isTechnical
    ? await scoreAnswer(currentTopic.name, question, answer)
    : { depth: null, notes: null };

  // Log this turn
  await supabase.from("interview_qa").insert({
    session_id: state.sessionId,
    topic: isTechnical ? currentTopic.name : state.phase,
    question,
    answer,
    depth_score: evaluation.depth,
    ai_notes: evaluation.notes,
    turn_number: state.totalQuestions + 1,
  });

  if (isTechnical) {
    currentTopic.questionsAsked += 1;
    currentTopic.scores.push(evaluation.depth);
  }

  state.phaseQuestions += 1;
  state.totalQuestions += 1;

  // ── Decide what's next ──
  const limit = isTechnical ? PHASE_LIMITS.technical : PHASE_LIMITS[state.phase];

  if (state.phaseQuestions >= limit) {
    // Advance phase or topic
    if (state.phase === "introduction") {
      state.phase = "projects";
      state.phaseQuestions = 0;
    } else if (state.phase === "projects") {
      state.phase = "hobbies";
      state.phaseQuestions = 0;
    } else if (state.phase === "hobbies") {
      state.phase = "technical";
      state.phaseQuestions = 0;
    } else if (state.phase === "technical") {
      // Move to next topic
      state.currentTopicIndex += 1;
      state.phaseQuestions = 0;

      // Check if all topics done or max reached
      const techTotal = state.topics.reduce((sum, t) => sum + t.questionsAsked, 0);
      if (state.currentTopicIndex >= state.topics.length || techTotal >= MAX_TECHNICAL_TOTAL) {
        return { done: true };
      }
    }
  }

  // Check global max
  if (state.phase === "technical") {
    const techTotal = state.topics.reduce((sum, t) => sum + t.questionsAsked, 0);
    if (techTotal >= MAX_TECHNICAL_TOTAL) {
      return { done: true };
    }
  }

  const nextQuestion = await generatePhaseQuestion(state, answer);
  const topicLabel = state.phase === "technical"
    ? state.topics[state.currentTopicIndex]?.name || "Technical"
    : state.phase.charAt(0).toUpperCase() + state.phase.slice(1);

  return { done: false, question: nextQuestion, topic: topicLabel };
}

// ─── 5. Generate final summary ───────────────────────────────────────────────
export async function generateSummary(state) {
  const { data: qaLog, error: qaError } = await supabase
    .from("interview_qa")
    .select("*")
    .eq("session_id", state.sessionId)
    .order("turn_number");

  if (qaError) throw qaError;

  const introQAs   = qaLog.filter(q => q.topic === "introduction");
  const projectQAs = qaLog.filter(q => q.topic === "projects");
  const hobbyQAs   = qaLog.filter(q => q.topic === "hobbies");
  const techQAs    = qaLog.filter(q => !["introduction","projects","hobbies"].includes(q.topic));

  const format = (arr) => arr.map(q => `Q: ${q.question}\nA: ${q.answer}`).join("\n\n");

  // Introduction summary
  const introSummaryRes = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: `Summarize this student's introduction in 2-3 sentences. Respond ONLY with the summary text.` },
      { role: "user", content: format(introQAs) },
    ],
    temperature: 0.4,
  });
  const introduction = introSummaryRes.choices[0].message.content.trim();

  // Projects summary
  const projectSummaryRes = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: `Extract the student's past projects from this conversation.
Respond ONLY in JSON array, no markdown fences: [{"name": "project name", "tech": ["tech1","tech2"], "description": "one sentence", "role": "their role"}]` },
      { role: "user", content: format(projectQAs) },
    ],
    temperature: 0.3,
  });
  let past_projects = [];
  try {
    const raw = projectSummaryRes.choices[0].message.content.trim().replace(/```json|```/g, "");
    past_projects = JSON.parse(raw);
  } catch { past_projects = []; }

  // Hobbies summary
  const hobbySummaryRes = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: `Summarize this student's hobbies and interests in one sentence. Also extract 3-5 soft skills as a JSON object.
Respond ONLY in JSON, no markdown fences: {"hobbies": "one sentence", "soft_skills": ["skill1","skill2"]}` },
      { role: "user", content: format(hobbyQAs) },
    ],
    temperature: 0.3,
  });
  let hobbies = "", soft_skills = [];
  try {
    const raw = hobbySummaryRes.choices[0].message.content.trim().replace(/```json|```/g, "");
    const parsed = JSON.parse(raw);
    hobbies = parsed.hobbies || "";
    soft_skills = parsed.soft_skills || [];
  } catch {}

  // Technical summary
  const techTranscript = techQAs.map(q => `[${q.topic}] Q: ${q.question}\nA: ${q.answer}\nDepth: ${q.depth_score}`).join("\n\n");

  const techSummaryRes = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: `Summarize this technical interview transcript.
Respond ONLY in JSON, no markdown fences:
{"topic_scores": {"TopicName": "basic|intermediate|advanced"}, "strengths": ["..."], "weaknesses": ["..."], "overall_summary": "2-3 sentence paragraph"}` },
      { role: "user", content: techTranscript || "No technical questions were answered." },
    ],
    temperature: 0.4,
  });

  let techSummary = { topic_scores: {}, strengths: [], weaknesses: [], overall_summary: "" };
  try {
    const raw = techSummaryRes.choices[0].message.content.trim().replace(/```json|```/g, "");
    techSummary = JSON.parse(raw);
  } catch {}

  // Save to DB
  const { data: sessionRow } = await supabase
    .from("interview_sessions")
    .select("student_id")
    .eq("id", state.sessionId)
    .single();

  await supabase.from("interview_summary").insert({
    session_id: state.sessionId,
    student_id: sessionRow.student_id,
    introduction,
    past_projects,
    hobbies,
    soft_skills,
    topic_scores: techSummary.topic_scores,
    strengths: techSummary.strengths,
    weaknesses: techSummary.weaknesses,
    overall_summary: techSummary.overall_summary,
  });

  await supabase
    .from("interview_sessions")
    .update({ status: "completed", ended_at: new Date() })
    .eq("id", state.sessionId);

  return {
    introduction,
    past_projects,
    hobbies,
    soft_skills,
    ...techSummary,
  };
}

// ─── 6. Recommend programs ───────────────────────────────────────────────────
export async function recommendPrograms(summary) {
  const { data: allPrograms, error } = await supabase.from("programs").select("*");
  if (error) throw error;

  const systemPrompt = `You are an academic advisor. Based on a student's interview summary,
recommend exactly 2 of these 4 programs that best fit their skill level, past projects and interests.
Programs available: ${allPrograms.map(p => p.name).join(", ")}.
Respond ONLY in JSON, no markdown fences: {"recommended": ["Program Name 1", "Program Name 2"], "reasoning": "one sentence why"}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(summary) },
    ],
    temperature: 0.3,
  });

  const raw = completion.choices[0].message.content.trim().replace(/```json|```/g, "");
  const result = JSON.parse(raw);

  return {
    allPrograms,
    recommended: result.recommended,
    reasoning: result.reasoning,
  };
}
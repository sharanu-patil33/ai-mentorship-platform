// interview/interviewEngine.js
import "dotenv/config";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const MAX_QUESTIONS_PER_TOPIC = 4;
const MAX_TOTAL_QUESTIONS = 15;
const MODEL = "openai/gpt-oss-120b";

// 1. Start a session: seed topics from student's known_topics
export async function startInterview(studentId, knownTopics) {
  const { data: session, error } = await supabase
    .from("interview_sessions")
    .insert({ student_id: studentId, status: "in_progress", mode: "mixed" })
    .select()
    .single();

  if (error) throw error;

  const state = {
    sessionId: session.id,
    topics: knownTopics.map((t) => ({ name: t, questionsAsked: 0, scores: [] })),
    currentTopicIndex: 0,
    totalQuestions: 0,
  };

  const firstQuestion = await generateQuestion(state, null);
  return { state, question: firstQuestion };
}

// 2. Generate next question — either opener or follow-up based on last answer
export async function generateQuestion(state, lastAnswer) {
  const currentTopic = state.topics[state.currentTopicIndex];

  const systemPrompt = `You are a technical interviewer assessing a student's real understanding of "${currentTopic.name}".
Ask ONE clear, specific question. If given the student's previous answer, decide whether to:
- go deeper into the same sub-topic (if the answer was strong), or
- ask a simpler clarifying question (if the answer was weak/vague).
Respond ONLY with the question text, no preamble.`;

  const userPrompt = lastAnswer
    ? `Previous answer from student: "${lastAnswer}"\nAsk the next question.`
    : `This is the first question on this topic. Ask an opening question.`;

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

// 3. Score an answer (depth + notes) — called right after student responds
async function scoreAnswer(topic, question, answer) {
  const systemPrompt = `You evaluate a student's interview answer on "${topic}".
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

// 4. Main turn handler: called every time the student answers
export async function handleAnswer(state, question, answer) {
  const currentTopic = state.topics[state.currentTopicIndex];

  const evaluation = await scoreAnswer(currentTopic.name, question, answer);

  // Log this turn to Supabase
  const { error: insertError } = await supabase.from("interview_qa").insert({
    session_id: state.sessionId,
    topic: currentTopic.name,
    question,
    answer,
    depth_score: evaluation.depth,
    ai_notes: evaluation.notes,
    turn_number: state.totalQuestions + 1,
  });

  if (insertError) throw insertError;

  currentTopic.questionsAsked += 1;
  currentTopic.scores.push(evaluation.depth);
  state.totalQuestions += 1;

  // Decide: stop entirely, switch topic, or continue same topic
  if (state.totalQuestions >= MAX_TOTAL_QUESTIONS) {
    return { done: true };
  }

  if (currentTopic.questionsAsked >= MAX_QUESTIONS_PER_TOPIC) {
    state.currentTopicIndex += 1;
    if (state.currentTopicIndex >= state.topics.length) {
      return { done: true };
    }
    const nextQuestion = await generateQuestion(state, null); // fresh topic, no lastAnswer
    return { done: false, question: nextQuestion, topic: state.topics[state.currentTopicIndex].name };
  }

  const nextQuestion = await generateQuestion(state, answer);
  return { done: false, question: nextQuestion, topic: currentTopic.name };
}

// 5. Final summary generation — called when done: true
export async function generateSummary(state) {
  const { data: qaLog, error: qaError } = await supabase
    .from("interview_qa")
    .select("*")
    .eq("session_id", state.sessionId)
    .order("turn_number");

  if (qaError) throw qaError;

  const transcript = qaLog
    .map((q) => `[${q.topic}] Q: ${q.question}\nA: ${q.answer}\nDepth: ${q.depth_score}`)
    .join("\n\n");

  const systemPrompt = `Summarize this technical interview transcript.
Respond ONLY in JSON, no markdown fences:
{
  "topic_scores": {"TopicName": "basic|intermediate|advanced"},
  "strengths": ["..."],
  "weaknesses": ["..."],
  "overall_summary": "2-3 sentence paragraph"
}`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: transcript },
    ],
    temperature: 0.4,
  });

  const raw = completion.choices[0].message.content.trim().replace(/```json|```/g, "");
  const summary = JSON.parse(raw);

  const { data: sessionRow, error: sessionError } = await supabase
    .from("interview_sessions")
    .select("student_id")
    .eq("id", state.sessionId)
    .single();

  if (sessionError) throw sessionError;

  const { error: summaryError } = await supabase.from("interview_summary").insert({
    session_id: state.sessionId,
    student_id: sessionRow.student_id,
    topic_scores: summary.topic_scores,
    strengths: summary.strengths,
    weaknesses: summary.weaknesses,
    overall_summary: summary.overall_summary,
  });

  if (summaryError) throw summaryError;

  await supabase
    .from("interview_sessions")
    .update({ status: "completed", ended_at: new Date() })
    .eq("id", state.sessionId);

  return summary;
}

// 6. Recommend 2 of 4 programs based on the interview summary
export async function recommendPrograms(summary) {
  const { data: allPrograms, error } = await supabase.from("programs").select("*");
  if (error) throw error;

  const systemPrompt = `You are an academic advisor. Based on a student's interview summary,
recommend exactly 2 of these 4 programs that best fit their current skill level and gaps.
Programs available: ${allPrograms.map((p) => p.name).join(", ")}.
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
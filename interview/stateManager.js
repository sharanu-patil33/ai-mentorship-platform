// interview/stateManager.js
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const MAX_QUESTIONS_PER_TOPIC = 4;
const MAX_TOTAL_QUESTIONS = 15;

// Rebuild state purely from what's in the database.
// This means the server can be stateless — any instance can handle any request,
// and a page refresh mid-interview doesn't lose progress.
export async function rebuildState(sessionId) {
  const { data: session, error: sessionError } = await supabase
    .from("interview_sessions")
    .select("*, students(known_topics)")
    .eq("id", sessionId)
    .single();

  if (sessionError) throw sessionError;
  if (!session) throw new Error("Session not found");

  const { data: qaLog, error: qaError } = await supabase
    .from("interview_qa")
    .select("*")
    .eq("session_id", sessionId)
    .order("turn_number");

  if (qaError) throw qaError;

  const knownTopics = session.students.known_topics; // e.g. ["React", "Node.js"]

  // Group logged answers by topic to figure out where we left off
  const topics = knownTopics.map((name) => {
    const topicQAs = qaLog.filter((q) => q.topic === name);
    return {
      name,
      questionsAsked: topicQAs.length,
      scores: topicQAs.map((q) => q.depth_score),
    };
  });

  // Find current topic: first one not yet at the per-topic limit
  let currentTopicIndex = topics.findIndex((t) => t.questionsAsked < MAX_QUESTIONS_PER_TOPIC);
  if (currentTopicIndex === -1) currentTopicIndex = topics.length; // all done

  return {
    sessionId,
    topics,
    currentTopicIndex,
    totalQuestions: qaLog.length,
    lastAnswer: qaLog.length ? qaLog[qaLog.length - 1].answer : null,
    lastQuestion: qaLog.length ? qaLog[qaLog.length - 1].question : null,
    isComplete: qaLog.length >= MAX_TOTAL_QUESTIONS || currentTopicIndex >= topics.length,
  };
}
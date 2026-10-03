// interview/stateManager.js
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const MAX_QUESTIONS_PER_PHASE = {
  introduction: 3,
  projects: 4,
  hobbies: 2,
  technical: 4,
};
const MAX_TECHNICAL_QUESTIONS = 12;

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

  const knownTopics = session.students.known_topics || [];
  // Always have at least one topic — fallback to General Programming
  const topicNames = knownTopics.length > 0 ? knownTopics : ["General Programming"];

  // Count Q&As per phase
  const introCount = qaLog.filter(q => q.topic === "introduction").length;
  const projectCount = qaLog.filter(q => q.topic === "projects").length;
  const hobbyCount = qaLog.filter(q => q.topic === "hobbies").length;
  const techQAs = qaLog.filter(q => !["introduction", "projects", "hobbies"].includes(q.topic));

  // Determine current phase
  let phase = "introduction";
  let phaseQuestions = introCount;

  if (introCount >= MAX_QUESTIONS_PER_PHASE.introduction) {
    phase = "projects";
    phaseQuestions = projectCount;
  }
  if (projectCount >= MAX_QUESTIONS_PER_PHASE.projects) {
    phase = "hobbies";
    phaseQuestions = hobbyCount;
  }
  if (hobbyCount >= MAX_QUESTIONS_PER_PHASE.hobbies) {
    phase = "technical";
    phaseQuestions = techQAs.length;
  }

  // Rebuild technical topic state
  const topics = topicNames.map(name => {
    const topicQAs = techQAs.filter(q => q.topic === name);
    return {
      name,
      questionsAsked: topicQAs.length,
      scores: topicQAs.map(q => q.depth_score),
    };
  });

  let currentTopicIndex = topics.findIndex(t => t.questionsAsked < MAX_QUESTIONS_PER_PHASE.technical);
  if (currentTopicIndex === -1) currentTopicIndex = topics.length;

  const totalTechnical = techQAs.length;
  const isComplete = phase === "technical" &&
    (totalTechnical >= MAX_TECHNICAL_QUESTIONS || currentTopicIndex >= topics.length);

  return {
    sessionId,
    phase,
    phaseQuestions,
    topics,
    currentTopicIndex,
    totalQuestions: qaLog.length,
    lastAnswer: qaLog.length ? qaLog[qaLog.length - 1].answer : null,
    lastQuestion: qaLog.length ? qaLog[qaLog.length - 1].question : null,
    isComplete,
  };
}
// interview/testRun.js
// Quick end-to-end test: creates a student, runs a short interview, prints summary.
// Run with: node interview/testRun.js

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { startInterview, handleAnswer, generateSummary } from "./interviewEngine.js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Sample canned answers to simulate a student — replace with real input later
const sampleAnswers = [
  "I used React hooks like useState and useEffect to manage state and side effects in my project.",
  "I'm not too sure about how useMemo works, I just use it sometimes when the app feels slow.",
];

async function run() {
  console.log("Creating test student...");
  const { data: student, error } = await supabase
    .from("students")
    .insert({
      name: "Test Student",
      email: `test-${Date.now()}@example.com`,
      known_topics: ["React"],
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create student:", error);
    return;
  }
  console.log("Student created:", student.id);

  console.log("\nStarting interview...");
  let { state, question } = await startInterview(student.id, ["React"]);
  console.log("Q1:", question);

  for (const answer of sampleAnswers) {
    console.log("A:", answer);
    const result = await handleAnswer(state, question, answer);
    if (result.done) {
      console.log("\nInterview marked done.");
      break;
    }
    question = result.question;
    console.log(`\nQ (${result.topic}):`, question);
  }

  console.log("\nGenerating summary...");
  const summary = await generateSummary(state);
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
}

run().catch(console.error);
/**
 * Builds the initial prompt for starting a session with DSH agent to configure a cron task.
 * English is the canonical source language; the conversation language follows
 * the user's DSH locale via the translation plugin.
 * @param {string} userText
 * @returns {string}
 */
export function buildAgentCronPrompt(userText) {
  const text = (userText || '').trim();
  return `The user wants to set up a scheduled (cron) task via DSH Cron.
The user's original request:
"${text}"

CRITICAL RULES FOR THE AGENT:
1. NEVER RUSH:
   It is STRICTLY FORBIDDEN to call the \`cron_create_task\` (or \`cron_schedule_task\`) tool in your first reply!
   You MUST NOT create the task until you have asked clarifying questions and received the user's confirmation.

2. FIRST QUESTION: LLM vs NO-LLM Shell (critical):
   - Evaluate the nature of the task:
     * If the task is TRIVIAL (checking an RSS/Atom feed, checking an HTTP status code, curl/ping/git checks, monitoring a file or a service) — you MUST recommend the NO-LLM Shell variant (type: "script")!
       Explain to the user: "A language model is overkill for this task — a simple bash script with curl/jq completes in milliseconds, is more reliable, and costs zero tokens. I recommend the NO-LLM Shell script variant."
     * If the task requires SEMANTIC ANALYSIS (summarizing messages, generating a report from unstructured text, making judgement calls) — propose an LLM task (type: "llm").
   - Ask the user whether they agree with the proposed task type.

3. WHAT YOU MUST CLARIFY:
   - If NO-LLM Shell was chosen:
     * Propose a ready-made shell script or command to execute.
     * Confirm that the script logic suits the user.
   - If LLM was chosen:
     * Propose an economical model from those available in the user's DSH installation and explain why it fits this task.
     * Ask whether this model works for the user.
   - The exact schedule:
     * Propose a concrete cron expression (for example, "0 */6 * * *" for 4 times a day, or "0 9 * * 1-5" for weekdays) and a plain-language explanation.
   - Silent Rule (notifications):
     * For checks and monitoring, apply the strict Silent Rule: when there are NO new events or changes — FULL SILENCE, no messages to chat/Telegram at all (exit 0 in scripts, or an empty reply). An alert is sent ONLY when something new is found or a failure occurs.
     * Confirm to the user that the silent rule will be enabled.

4. STRUCTURE OF THE FIRST REPLY:
   - Briefly confirm the essence of the task.
   - Present the draft task card:
     • Type: [NO-LLM Shell (recommended) / LLM]
     • Schedule: [cron expression and a plain-language description]
     • Implementation / Script / Model: [script code or the proposed model]
     • Silent Rule: [only on new events / failures]
   - Ask any remaining questions and ask the user to confirm task creation.

5. CREATING THE TASK:
   Only AFTER the user replies and confirms the parameters, call the \`cron_create_task\` tool with:
   - title: a clear task name
   - schedule: the agreed cron expression
   - prompt: the final shell command/script path (for type="script") OR detailed instructions including the Silent Rule (for type="llm")
   - type: "script" or "llm"
   - provider and model: the agreed provider and model (only if type="llm")
   - delivery: "isolated"`;
}

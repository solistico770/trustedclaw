import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export type CaseClassificationResult = {
  severity: "critical" | "high" | "medium" | "low" | "info";
  urgency: "immediate" | "soon" | "normal" | "low";
  importance_level: number; // 1-10
  escalation_level: "none" | "low" | "medium" | "high" | "critical";
  title: string;
  summary: string;
  suggested_status: "open" | "action_needed" | "in_progress" | "addressed" | "closed" | "escalated";
  reasoning: string;
};

export async function classifyCase(
  currentTitle: string | null,
  eventContents: string[],
  entityNames: string[],
  currentStatus?: string,
  currentImportance?: number
): Promise<CaseClassificationResult> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const eventsText = eventContents
    .map((content, i) => `[Event ${i + 1}]: ${content}`)
    .join("\n");

  const prompt = `You are an operational case management AI. Analyze this case and provide a holistic classification.

Current case title: ${currentTitle || "New case"}
Current status: ${currentStatus || "open"}
Current importance: ${currentImportance || 5}/10
Entities involved: ${entityNames.length > 0 ? entityNames.join(", ") : "none identified yet"}

Events in this case (chronological):
${eventsText}

Based on ALL events in this case (not just the latest), assess:

1. severity: overall severity of this case
   - critical: immediate financial loss, legal, safety, system down
   - high: significant impact if delayed, deadline, key relationship risk
   - medium: regular business matter
   - low: routine, FYI
   - info: noise, automated

2. urgency: how quickly this needs attention
   - immediate: within 1 hour
   - soon: today
   - normal: 1-3 days
   - low: no time pressure

3. importance_level: 1-10 score (10=most important). Consider: how many events, how urgent, what entities, financial impact, relationship impact

4. escalation_level: should this case be escalated to the human?
   - none: handled autonomously
   - low: FYI only
   - medium: needs attention soon
   - high: needs attention now
   - critical: drop everything

5. title: a short (max 80 chars) title summarizing the CASE (not just the last event)

6. summary: 1-2 sentence summary of the situation

7. suggested_status: what should the case status be?
   - open: new, not yet addressed
   - action_needed: requires immediate attention
   - addressed: someone is working on it
   - closed: issue resolved (only if events indicate resolution)
   - escalated: needs human intervention

8. reasoning: why you classified it this way (max 200 chars)

Important: If the situation is ESCALATING (new urgent info), increase importance. If RESOLVING (positive signals), decrease.

Return ONLY JSON:
{
  "severity": "string",
  "urgency": "string",
  "importance_level": number,
  "escalation_level": "string",
  "title": "string",
  "summary": "string",
  "suggested_status": "string",
  "reasoning": "string"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text);
}

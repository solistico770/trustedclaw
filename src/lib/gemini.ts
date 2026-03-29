import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export type EnrichmentResult = {
  detected_language: string;
  intent_tags: string[];
  sentiment: "positive" | "neutral" | "negative" | "urgent";
  mentioned_entities: Array<{
    name: string;
    type: "person" | "company" | "project" | "invoice" | "amount" | "date" | "other";
    confidence: number;
  }>;
};

export type ClassificationResult = {
  severity: "critical" | "high" | "medium" | "low" | "info";
  urgency: "immediate" | "soon" | "normal" | "low";
  reasoning: string;
  proposed_action: string;
  confidence: number;
};

async function geminiJSON<T>(prompt: string): Promise<T> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text);
}

export async function enrichEvent(content: string, senderName?: string, channelName?: string): Promise<EnrichmentResult> {
  const prompt = `Analyze this incoming message and extract structured information.
Sender: ${senderName || "Unknown"}
Channel: ${channelName || "Unknown"}
Message: ${content}

Return a JSON object with exactly these fields:
{
  "detected_language": "string (ISO 639-1 code like 'en', 'he', 'ar')",
  "intent_tags": ["array of intent strings like 'payment_request', 'question', 'update', 'complaint', 'greeting'"],
  "sentiment": "one of: positive, neutral, negative, urgent",
  "mentioned_entities": [
    {
      "name": "entity name",
      "type": "one of: person, company, project, invoice, amount, date, other",
      "confidence": 0.0 to 1.0
    }
  ]
}

Return ONLY the JSON, no markdown formatting.`;

  return geminiJSON<EnrichmentResult>(prompt);
}

export async function classifyEvent(
  content: string,
  enrichment?: EnrichmentResult,
  senderName?: string
): Promise<ClassificationResult> {
  const enrichmentContext = enrichment
    ? `\nEnrichment data: Language=${enrichment.detected_language}, Sentiment=${enrichment.sentiment}, Intent=${enrichment.intent_tags.join(", ")}, Entities=${enrichment.mentioned_entities.map((e) => `${e.name}(${e.type})`).join(", ")}`
    : "\nEnrichment: unavailable";

  const prompt = `Classify the severity and urgency of this incoming event for an operational agent system.
Sender: ${senderName || "Unknown"}
Message: ${content}
${enrichmentContext}

Severity levels:
- critical: immediate financial loss, legal issue, safety concern, or system outage
- high: significant impact if delayed, important deadline, key relationship at risk
- medium: regular business matter requiring attention
- low: routine communication, FYI messages
- info: noise, spam, automated notifications

Urgency levels:
- immediate: response needed within 1 hour
- soon: response needed today
- normal: response within 1-3 days
- low: no time pressure

Return a JSON object with exactly these fields:
{
  "severity": "one of: critical, high, medium, low, info",
  "urgency": "one of: immediate, soon, normal, low",
  "reasoning": "brief explanation why (max 200 chars)",
  "proposed_action": "what should be done (max 100 chars)",
  "confidence": 0.0 to 1.0
}

Return ONLY the JSON, no markdown formatting.`;

  return geminiJSON<ClassificationResult>(prompt);
}

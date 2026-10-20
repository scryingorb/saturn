export type AffirmationEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  AFFIRMATION_ALLOWED_ORIGINS?: string;
  AFFIRMATION_RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
};

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

const GENERAL_MESSAGES = [
  "The outlook is bright—start with one small step and let momentum meet you there.",
  "Yes, with patience. You are closer than the doubt in your head wants you to believe.",
  "The signs point toward progress, especially if you give yourself room to begin imperfectly.",
  "Trust the next kind, practical step. You do not need the whole path at once.",
  "A good possibility is opening up—bring your effort, keep your expectations gentle, and see what grows.",
];

function hashQuestion(question: string) {
  return [...question].reduce((total, character) => total + character.charCodeAt(0), 0);
}

function builtInAnswer(question: string) {
  const normalized = question.toLowerCase();

  if (/hurt myself|kill myself|suicide|don['’]t want to live/.test(normalized)) {
    return "You deserve real support right now—please reach out to someone you trust or a crisis service where you are.";
  }
  if (/stress|overwhelm|anxious|panic|too much/.test(normalized)) {
    return "You do not have to solve everything at once—choose the smallest kind next step and breathe before the next one.";
  }
  if (/exam|test|class|school|study|grade/.test(normalized)) {
    return "You are more prepared than your nerves suggest—one focused study block can move this forward today.";
  }
  if (/job|interview|career|work|project/.test(normalized)) {
    return "The outlook favors steady effort—show what you know, stay curious, and let the next opportunity meet you halfway.";
  }
  if (/friend|love|relationship|date/.test(normalized)) {
    return "Lead with honesty and warmth; the right connection will make room for the real you.";
  }

  return GENERAL_MESSAGES[hashQuestion(question) % GENERAL_MESSAGES.length];
}

function extractText(response: OpenAIResponse) {
  if (response.output_text?.trim()) return response.output_text.trim();

  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) {
        return content.text.trim();
      }
    }
  }
  return "";
}

export async function handleAffirmation(request: Request, env: AffirmationEnv, providerFetch: typeof fetch = fetch) {
  const origin = request.headers.get("Origin");
  const allowedOrigins = (env.AFFIRMATION_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  const allowed = !origin || origin === new URL(request.url).origin || allowedOrigins.includes(origin);
  const headers = new Headers({ "Cache-Control": "no-store", "Vary": "Origin", "X-Content-Type-Options": "nosniff" });
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!allowed) return json({ error: "Origin is not allowed." }, 403);
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  if (request.method === "OPTIONS") {
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    headers.set("Allow", "POST, OPTIONS");
    return json({ error: "Use POST." }, 405);
  }
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Send a question as JSON." }, 415);
  }
  const limit = 2048;
  if (Number(request.headers.get("Content-Length")) > limit) return json({ error: "Question is too large." }, 413);
  let question = "";
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          return json({ error: "Question is too large." }, 413);
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { question?: unknown } | null;
    question = typeof body?.question === "string" ? body.question.trim() : "";
  } catch {
    return json({ error: "Send a question as JSON." }, 400);
  }

  if (!question || question.length > 240) {
    return json({ error: "Ask a question of 1 to 240 characters." }, 400);
  }

  const fallback = () => json({ message: builtInAnswer(question), source: "built-in" });
  if (!env.OPENAI_API_KEY) {
    return fallback();
  }

  try {
    // Fail closed for paid calls if the deployed quota guard is unavailable.
    const clientIp = request.headers.get("CF-Connecting-IP");
    if (!env.AFFIRMATION_RATE_LIMITER || !clientIp) return fallback();
    if (!(await env.AFFIRMATION_RATE_LIMITER.limit({ key: clientIp })).success) {
      headers.set("Retry-After", "60");
      return json({ error: "Please wait a minute before asking again." }, 429);
    }
    const apiResponse = await providerFetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(12000),
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-5",
        store: false,
        max_output_tokens: 80,
        instructions:
          "You are Saturn, a kind positive Magic 8 Ball inside a day-planning and stress-reset app. Reply with exactly one supportive sentence of no more than 22 words. Be encouraging but honest, never promise an outcome, and suggest a gentle next step when useful. Do not diagnose or give medical, legal, or financial advice.",
        input: question,
      }),
    });

    if (!apiResponse.ok) throw new Error("OpenAI request failed");
    const data = (await apiResponse.json()) as OpenAIResponse;
    const message = extractText(data);
    if (!message) throw new Error("OpenAI returned no text");

    return json({ message: message.slice(0, 500), source: "ai" });
  } catch {
    return fallback();
  }
}

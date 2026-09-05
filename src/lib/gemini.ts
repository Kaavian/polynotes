import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "dummy",
});

export interface TranscriptSegmentResult {
  speakerLabel: string;
  startTime: number;
  endTime: number;
  originalText: string;
  detectedLanguage: string;
  translatedTextEn: string | null;
  codeSwitchFlag: boolean;
}

export interface MeetingIntelligenceResult {
  summary: {
    abstract: string;
    keyPoints: string[];
    risks: string[];
    blockers: string[];
  };
  actions: {
    title: string;
    owner: string | null;
    dueDate: string | null;
    linkedSegmentIndex: number;
    sourceLanguage: string;
  }[];
}

const CODE_SWITCHING_RULES = `
  You are PolyNotes AI, an expert multilingual meeting transcription and intelligence engine.
  I have uploaded a short slice of audio from a meeting where speakers may code-switch heavily between English and Indian languages (Tamil, Hindi, Telugu, etc.).

  CRITICAL CODE-SWITCHING RULES FOR 'originalText':
  Your transcription MUST be an EXACT word-for-word map of what the microphone heard.
  1. If a spoken word is English, you MUST type it in English A-Z letters.
  2. If a spoken word is Tamil, you MUST type it in the Tamil script.
  3. ZERO-TOLERANCE WARNING: NEVER EVER phonetically spell an English word using Tamil letters. (e.g. NEVER write "சிஸ்டம்" or "காய்ஸ்").

  PERFECT EXAMPLE: "Okay guys, meeting start பண்ணலாம்."
  CATASTROPHIC FAILURE EXAMPLE: "ஓகே காய்ஸ் மீட்டிங் ஸ்டார்ட் பண்ணலாம்." (DO NOT DO THIS!)

  YOUR JOB:
  1. TRANSCRIBE the audio using the strict rules above. Group by speaker turns with 'startTime' and 'endTime' measured in seconds FROM THE START OF THIS AUDIO SLICE (i.e. the first segment normally starts near 0.0).
  2. For 'detectedLanguage', identify the spoken language (e.g. "English", "Tamil", "English & Tamil").
  3. For 'translatedTextEn': If the sentence contains ANY Tamil/Non-English words, output the FULL pure English translation of the entire sentence here. If the sentence is 100% English A-Z words, STRICTLY set this to null.
  4. Set 'codeSwitchFlag' to true if you mixed English A-Z words and Tamil words in the same segment.
  5. If this audio slice contains silence or no intelligible speech, return an empty "segments" array.

  Return your response STRICTLY as a JSON object matching this schema:
  {
    "segments": [
      {
        "speakerLabel": "Speaker 1",
        "startTime": 0.0,
        "endTime": 5.5,
        "originalText": "...(native script)...",
        "detectedLanguage": "English" | "Tamil" | "Hindi" | "Tanglish" | etc,
        "translatedTextEn": "..." | null,
        "codeSwitchFlag": true|false
      }
    ]
  }
`;

// Transcribes ONE short audio chunk. Meant to be called for each ~60-90s slice
// of a recording so a single Gemini call never has to carry a whole meeting's
// worth of audio and risk a serverless function timeout. Throws on real
// failures instead of silently returning placeholder data, so the caller can
// mark the meeting FAILED with a real reason.
export async function transcribeChunkWithGemini(buffer: Buffer, mimeType: string): Promise<TranscriptSegmentResult[]> {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("[PolyNotes Gemini] GEMINI_API_KEY is not set. Returning mock segments (local/dev only).");
    return mockSegments();
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: buffer.toString('base64') } },
          { text: CODE_SWITCHING_RULES },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  });

  const raw = response.text;
  if (!raw) {
    throw new Error("Gemini returned an empty response for this audio chunk.");
  }

  let parsed: { segments?: TranscriptSegmentResult[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Gemini returned malformed JSON for this audio chunk.");
  }

  return parsed.segments ?? [];
}

// Lightweight, text-only pass over the full merged transcript (English text
// where a segment was translated, original text otherwise) to produce the
// executive summary and action items once every chunk has been transcribed.
export async function generateMeetingMetadataWithGemini(fullTranscriptText: string): Promise<MeetingIntelligenceResult> {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("[PolyNotes Gemini] GEMINI_API_KEY is not set. Returning mock metadata (local/dev only).");
    return mockMetadata();
  }

  const prompt = `
    You are PolyNotes AI, an expert Executive Assistant.
    Below is the complete transcribed text of a finalized multilingual meeting. Any speech that was
    originally in Tamil, Hindi, or another language has already been translated into English here, so
    treat this transcript as the full and complete record of everything discussed, regardless of which
    language it was originally spoken in.

    Please analyze the text and extract a comprehensive executive summary and any strictly explicitly
    requested action items. Do not omit information just because it originated from a translated segment.

    Transcription Transcript:
    ---
    ${fullTranscriptText}
    ---

    Return EXACTLY a JSON object matching this schema:
    {
      "summary": { "abstract": "...", "keyPoints": ["..."], "risks": ["..."], "blockers": ["..."] },
      "actions": [{ "title": "...", "owner": "...", "dueDate": "...", "linkedSegmentIndex": 0, "sourceLanguage": "Tamil" }]
    }
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { responseMimeType: "application/json" },
  });

  const raw = response.text;
  if (!raw) {
    throw new Error("Gemini returned an empty response while summarizing the meeting.");
  }

  try {
    return JSON.parse(raw) as MeetingIntelligenceResult;
  } catch {
    throw new Error("Gemini returned malformed JSON while summarizing the meeting.");
  }
}

function mockSegments(): TranscriptSegmentResult[] {
  return [
    { speakerLabel: "Speaker 1", startTime: 0.0, endTime: 5.5, originalText: "Alright team, let's review the upcoming launch.", detectedLanguage: "English", translatedTextEn: null, codeSwitchFlag: false },
    { speakerLabel: "Speaker 2", startTime: 6.0, endTime: 12.2, originalText: "I have prepared the initial dashboard, aduthathu yenna pannanum nu therila.", detectedLanguage: "English & Tamil", translatedTextEn: "I have prepared the initial dashboard, I'm not sure what to do next.", codeSwitchFlag: true },
  ];
}

function mockMetadata(): MeetingIntelligenceResult {
  return {
    summary: {
      abstract: "The team discussed the upcoming analytics tracking launch.",
      keyPoints: ["Dashboard is ready", "Analytics page tracking needs fixes before Friday"],
      risks: ["Tracking events might not be completed on time"],
      blockers: [],
    },
    actions: [
      {
        title: "Implement analytics tracking events",
        owner: "Speaker 2",
        dueDate: "Friday",
        linkedSegmentIndex: 1,
        sourceLanguage: "Tamil",
      },
    ],
  };
}

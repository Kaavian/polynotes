import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "dummy",
});

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

// Lightweight, text-only pass over the full merged transcript (English text
// where a segment was translated, original text otherwise) to produce the
// executive summary and action items once every chunk has been transcribed
// by Sarvam. Throws on real failures instead of silently returning
// placeholder data, so the caller can mark the meeting FAILED with a real reason.
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
        owner: "Speaker",
        dueDate: "Friday",
        linkedSegmentIndex: 1,
        sourceLanguage: "Tamil",
      },
    ],
  };
}

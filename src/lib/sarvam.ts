import { SarvamAIClient } from "sarvamai";

const client = new SarvamAIClient({ apiSubscriptionKey: process.env.SARVAM_API_KEY || "dummy" });

export interface TranscriptSegmentResult {
  speakerLabel: string;
  startTime: number;
  endTime: number;
  originalText: string;
  detectedLanguage: string;
  translatedTextEn: string | null;
  codeSwitchFlag: boolean;
}

const LANGUAGE_NAMES: Record<string, string> = {
  "hi-IN": "Hindi", "bn-IN": "Bengali", "kn-IN": "Kannada", "ml-IN": "Malayalam",
  "mr-IN": "Marathi", "od-IN": "Odia", "pa-IN": "Punjabi", "ta-IN": "Tamil",
  "te-IN": "Telugu", "en-IN": "English", "gu-IN": "Gujarati", "as-IN": "Assamese",
  "ur-IN": "Urdu", "ne-IN": "Nepali",
};

function toFriendlyLanguage(code?: string): string {
  if (!code) return "Unknown";
  return LANGUAGE_NAMES[code] || code;
}

// Transcribes ONE short (<=25s, to stay under Sarvam's 30s synchronous REST
// cap) slice of a meeting's audio. Sarvam's saaras:v3 model, unlike a
// general-purpose LLM, is purpose-built for exactly this app's hardest
// problem: keeping English words in Latin script and Indic words in their
// native script within the same sentence, rather than phonetically
// transliterating one into the other.
export async function transcribeChunkWithSarvam(buffer: Buffer, durationSeconds: number): Promise<TranscriptSegmentResult[]> {
  if (!process.env.SARVAM_API_KEY) {
    console.warn("[PolyNotes Sarvam] SARVAM_API_KEY is not set. Returning mock segments (local/dev only).");
    return mockSegments(durationSeconds);
  }

  const file = { data: buffer, filename: "chunk.wav", contentType: "audio/wav" };

  const codemix = await client.speechToText.transcribe({
    file,
    mode: "codemix",
    language_code: "unknown",
  });

  const originalText = codemix.transcript?.trim();
  if (!originalText) {
    // Silence or no intelligible speech in this chunk - nothing to record.
    return [];
  }

  const languageCode = codemix.language_code;
  const isPureEnglish = (languageCode || "").toLowerCase().startsWith("en");

  let translatedTextEn: string | null = null;
  if (!isPureEnglish) {
    const translated = await client.speechToText.transcribe({
      file,
      mode: "translate",
      language_code: "unknown",
    });
    translatedTextEn = translated.transcript?.trim() || null;
  }

  return [{
    speakerLabel: "Speaker",
    startTime: 0,
    endTime: durationSeconds,
    originalText,
    detectedLanguage: toFriendlyLanguage(languageCode),
    translatedTextEn,
    codeSwitchFlag: !isPureEnglish && /[A-Za-z]{2,}/.test(originalText),
  }];
}

function mockSegments(durationSeconds: number): TranscriptSegmentResult[] {
  return [{
    speakerLabel: "Speaker",
    startTime: 0,
    endTime: durationSeconds,
    originalText: "Alright team, let's review the upcoming launch, aduthathu yenna pannanum nu therila.",
    detectedLanguage: "Tamil",
    translatedTextEn: "Alright team, let's review the upcoming launch, I'm not sure what to do next.",
    codeSwitchFlag: true,
  }];
}

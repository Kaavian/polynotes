import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || "dummy",
  httpOptions: { timeout: 0 } // Prevent Node.js undici 5-minute HEADERS_TIMEOUT crash for enormous 1-hour audio transcriptions
});

export interface FullIntelligenceResult {
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
  segments: {
    speakerLabel: string;
    startTime: number;    // seconds
    endTime: number;      // seconds
    originalText: string; // The strictly native language script
    detectedLanguage: string;
    translatedTextEn: string | null;
    codeSwitchFlag: boolean;
  }[];
}

export async function* streamMeetingWithGemini(filePath: string, mimeType: string = "audio/webm"): AsyncGenerator<string, void, unknown> {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("No Gemini API key. Returning unified mock dynamically.");
    yield JSON.stringify(executeUnifiedMock());
    return;
  }

  let uploadResult: any = null;

  try {
    uploadResult = await ai.files.upload({
      file: filePath,
      config: { mimeType: mimeType }
    });

    let fileState = uploadResult.state;
    while (fileState === 'PROCESSING') {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const fileStatusRef = await ai.files.get({ name: uploadResult.name });
      fileState = fileStatusRef.state;
      uploadResult = fileStatusRef;
    }
    
    if (fileState === 'FAILED') {
      throw new Error("Gemini rejected the audio file entirely (FAILED state).");
    }

    const prompt = `
      You are PolyNotes AI, an expert multilingual meeting transcription and intelligence engine.
      I have uploaded an audio recording of a meeting where speakers may code-switch heavily between English and Indian languages (Tamil, Hindi, Telugu, etc.).
      
      CRITICAL CODE-SWITCHING RULES FOR 'originalText':
      Your transcription MUST be an EXACT word-for-word map of what the microphone heard.
      1. If a spoken word is English, you MUST type it in English A-Z letters.
      2. If a spoken word is Tamil, you MUST type it in the Tamil script.
      3. ZERO-TOLERANCE WARNING: NEVER EVER phonetically spell an English word using Tamil letters. (e.g. NEVER write "சிஸ்டம்" or "காய்ஸ்").
      
      PERFECT EXAMPLE: "Okay guys, meeting start பண்ணலாம்."
      CATASTROPHIC FAILURE EXAMPLE: "ஓகே காய்ஸ் மீட்டிங் ஸ்டார்ட் பண்ணலாம்." (DO NOT DO THIS!)

      YOUR JOB:
      1. TRANSCRIBE the audio using the strict rules above. Group by speaker turns with 'startTime' and 'endTime'.
      2. For 'detectedLanguage', identify the spoken language (e.g. "English", "Tamil", "English & Tamil").
      3. For 'translatedTextEn': If the sentence contains ANY Tamil/Non-English words, output the FULL pure English translation of the entire sentence here. If the sentence is 100% English A-Z words, STRICTLY set this to null.
      4. Set 'codeSwitchFlag' to true if you mixed English A-Z words and Tamil words in the same segment.
      5. Generate a comprehensive meeting summary and action items based precisely on the segments.

      Return your response STRICTLY as a JSON object matching this schema. You MUST output the 'summary' and 'actions' arrays FIRST.
      {
        "summary": { "abstract": "...", "keyPoints": ["..."], "risks": ["..."], "blockers": ["..."] },
        "actions": [{ "title": "...", "owner": "...", "dueDate": "...", "linkedSegmentIndex": 0, "sourceLanguage": "Tamil" }],
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

    const contents = [
      {
        role: "user",
        parts: [
          { fileData: { fileUri: uploadResult.uri, mimeType: uploadResult.mimeType } },
          { text: prompt }
        ]
      }
    ];

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        responseMimeType: "application/json",
      }
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }

    try {
      await ai.files.delete({ name: uploadResult.name });
    } catch(e) { }

  } catch (error: any) {
    if (uploadResult) {
      try { await ai.files.delete({ name: uploadResult.name }); } catch(e) { }
    }
    console.error("Gemini meeting streaming failed natively:", error?.message || error);
    // Yield a safe JSON stream terminator so partial segment parsing works cleanly up to the crash point
    yield '\n] }'; 
  }
}

export async function generateMeetingMetadataWithGemini(fullTranscriptText: string): Promise<FullIntelligenceResult> {
  if (!process.env.GEMINI_API_KEY) {
    return executeUnifiedMock();
  }

  const prompt = `
    You are PolyNotes AI, an expert Executive Assistant.
    Below is the complete transcribed text of a finalized multilingual meeting.
    Please analyze the text and extract a comprehensive executive summary and any strictly explicitly requested action items.

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

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const parsed = JSON.parse(response.text || "{}");
    return parsed as FullIntelligenceResult;
  } catch (error) {
    console.error("Gemini metadata generation failed natively:", error);
    return executeUnifiedMock();
  }
}

function executeUnifiedMock(): FullIntelligenceResult {
  return {
    summary: {
      abstract: "The team discussed the upcoming analytics tracking launch.",
      keyPoints: ["Dashboard is ready", "Analytics page tracking needs fixes before Friday"],
      risks: ["Tracking events might not be completed on time"],
      blockers: []
    },
    actions: [
      {
        title: "Implement analytics tracking events",
        owner: "Speaker 3",
        dueDate: "Friday",
        linkedSegmentIndex: 3,
        sourceLanguage: "Tamil"
      }
    ],
    segments: [
      { speakerLabel: "Speaker 1", startTime: 0.0, endTime: 5.5, originalText: "Alright team, let's review the upcoming launch.", detectedLanguage: "English", translatedTextEn: null, codeSwitchFlag: false }
    ]
  };
}

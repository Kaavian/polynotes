import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || "dummy",
  httpOptions: { timeout: 0 }
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
    startTime: number;
    endTime: number;
    originalText: string;
    detectedLanguage: string;
    translatedTextEn: string | null;
    codeSwitchFlag: boolean;
  }[];
}

export async function* streamMeetingWithGemini(filePath: string, mimeType: string = "audio/webm", speakerTimestamps?: string | null): AsyncGenerator<string, void, unknown> {
  if (!process.env.GEMINI_API_KEY) {
    console.error("[PolyNotes Gemini] GEMINI_API_KEY is not set! Returning mock data.");
    yield JSON.stringify(executeUnifiedMock());
    return;
  }

  console.log(`[PolyNotes Gemini] Starting processing. File: ${filePath}, MimeType: ${mimeType}`);
  console.log(`[PolyNotes Gemini] API Key present: ${process.env.GEMINI_API_KEY ? 'YES (starts with ' + process.env.GEMINI_API_KEY.substring(0, 8) + '...)' : 'NO'}`);

  let uploadResult: { name?: string; uri?: string; mimeType?: string; state?: string } | null = null;

  try {
    // Step 1: Upload the audio file to Gemini Files API
    console.log("[PolyNotes Gemini] Step 1: Uploading audio file to Gemini Files API...");
    const uploadStart = Date.now();
    
    uploadResult = await ai.files.upload({
      file: filePath,
      config: { mimeType: mimeType }
    });
    
    console.log(`[PolyNotes Gemini] Upload complete in ${Date.now() - uploadStart}ms. File name: ${uploadResult.name}, state: ${uploadResult.state}`);

    // Step 2: Wait for Gemini to process the uploaded file
    let fileState = uploadResult.state;
    let pollCount = 0;
    while (fileState === 'PROCESSING') {
      pollCount++;
      console.log(`[PolyNotes Gemini] Step 2: File still processing... (poll #${pollCount})`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const fileStatusRef = await ai.files.get({ name: String(uploadResult.name) });
      fileState = fileStatusRef.state;
      uploadResult = fileStatusRef;
    }
    
    if (fileState === 'FAILED') {
      const errorMsg = `Gemini rejected the audio file (state=FAILED). File: ${uploadResult.name}`;
      console.error(`[PolyNotes Gemini] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    console.log(`[PolyNotes Gemini] File ready. State: ${fileState}, URI: ${uploadResult.uri}`);

    // Step 3: Send the file to Gemini for transcription
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
      
      ${speakerTimestamps ? `5. CRITICAL ARCHITECTURAL DIRECTIVE: The Google Meet engine natively scraped the EXACT real names of the meeting participants and mapped them to their specific speaking time boundaries! 
         Here is the chronological active speaker map perfectly mapped alongside offsets (in milliseconds) for this WebM audio segment:
         [SPEAKER MAP LOGS]: ${speakerTimestamps}
         You are MATHEMATICALLY REQUIRED to use the names found inside this exact map corresponding to their timeframe limits for your 'speakerLabel' instead of generic aliases like "Speaker 1"!` : `5. Generate a comprehensive meeting summary and action items based precisely on the segments.`}

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contents: any = [
      {
        role: "user",
        parts: [
          { fileData: { fileUri: uploadResult.uri, mimeType: uploadResult.mimeType } },
          { text: prompt }
        ]
      }
    ];

    console.log("[PolyNotes Gemini] Step 3: Sending to Gemini for transcription stream...");
    const streamStart = Date.now();

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        responseMimeType: "application/json",
      }
    });

    let chunkCount = 0;
    let totalChars = 0;
    for await (const chunk of stream) {
      if (chunk.text) {
        chunkCount++;
        totalChars += chunk.text.length;
        yield chunk.text;
      }
    }

    console.log(`[PolyNotes Gemini] Stream complete in ${Date.now() - streamStart}ms. Chunks: ${chunkCount}, Total chars: ${totalChars}`);

    try {
      await ai.files.delete({ name: String(uploadResult.name) });
      console.log("[PolyNotes Gemini] Cleaned up uploaded file from Gemini.");
    } catch { }

  } catch (error: unknown) {
    if (uploadResult) {
      try { await ai.files.delete({ name: String(uploadResult.name) }); } catch { }
    }
    const safeError = error instanceof Error ? error.message : String(error);
    console.error("[PolyNotes Gemini] CRITICAL FAILURE:", safeError);
    
    // Yield an error marker that the route can detect and surface to the user
    yield `__GEMINI_ERROR__:${safeError}`;
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
    console.error("Gemini metadata generation failed:", error);
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

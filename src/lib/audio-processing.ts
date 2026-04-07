export interface segmentData {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export async function transcribeWithElevenLabs(audioFile: File, mimeType: string = 'audio/webm'): Promise<segmentData[]> {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!ELEVENLABS_API_KEY) {
    console.warn("No ElevenLabs API Key provided. Returning mock segments for demonstration.");
    return executeMockTranscription();
  }

  try {
    const formData = new FormData();
    // Use the native HTTP request File object directly to guarantee Node.js undici doesn't corrupt the streaming multipart boundary
    formData.append("file", audioFile);
    formData.append("model_id", "scribe_v1"); // their STT model
    formData.append("diarize", "true"); // enable speaker diarization

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("ElevenLabs API Error:", err);
      throw new Error("ElevenLabs STT failed");
    }

    const data = await response.json();
    return data.words ? processWordsIntoSegments(data.words) : executeMockTranscription();
  } catch (error) {
    console.error("Transcription error:", error);
    return executeMockTranscription(); // fallback to mock if real api fails
  }
}

// Very simple grouping of words by speaker into segments
function processWordsIntoSegments(words: any[]): segmentData[] {
  const segments: segmentData[] = [];
  let currentSegment: any = null;

  for (const word of words) {
    const speaker = word.speaker_id || "Speaker 1";
    if (!currentSegment || currentSegment.speaker !== speaker) {
      if (currentSegment) segments.push(currentSegment);
      currentSegment = {
        speaker: speaker,
        start: word.start,
        end: word.end,
        text: word.text
      };
    } else {
      currentSegment.text += " " + word.text;
      currentSegment.end = word.end;
    }
  }
  if (currentSegment) segments.push(currentSegment);
  return segments;
}

function executeMockTranscription(): segmentData[] {
  return [
    { speaker: "Speaker 1", start: 0.0, end: 5.5, text: "Alright team, let's review the upcoming launch." },
    { speaker: "Speaker 2", start: 6.0, end: 12.2, text: "I have prepared the initial dashboard, but aduthathu yenna pannanum nu I'm not sure." },
    { speaker: "Speaker 1", start: 13.0, end: 18.5, text: "We need to fix the analytics page. Please ensure tracking is completed by Friday." },
    { speaker: "Speaker 3", start: 19.0, end: 24.1, text: "Naan athu paathukren. I'll get the tracking events added." },
    { speaker: "Speaker 1", start: 25.0, end: 28.0, text: "Excellent. Let's touch base on Monday." }
  ];
}

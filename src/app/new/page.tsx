"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Square, UploadCloud, FileAudio, ArrowRight, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function NewMeeting() {
  const searchParams = useSearchParams();
  const initMode = searchParams.get("mode") === "record" ? "record" : "upload";
  const [mode, setMode] = useState<"record"|"upload">(initMode);
  const router = useRouter();

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  
  // Processing
  const [title, setTitle] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressState, setProgressState] = useState({ percent: 0, text: "" });
  const [liveSegments, setLiveSegments] = useState<any[]>([]);
  const segmentContainerRef = useRef<HTMLDivElement>(null);

  // Timer effect
  useEffect(() => {
    if (isRecording) {
      timerInterval.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerInterval.current) clearInterval(timerInterval.current);
    }
    return () => {
      if (timerInterval.current) clearInterval(timerInterval.current);
    };
  }, [isRecording]);

  useEffect(() => {
    if (segmentContainerRef.current) {
      segmentContainerRef.current.scrollTop = segmentContainerRef.current.scrollHeight;
    }
  }, [liveSegments]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          setAudioChunks((prev) => [...prev, e.data]);
        }
      };
      recorder.onstop = () => {
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
      };
      mediaRecorder.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    let finalBlob: Blob | null = null;
    
    if (mode === "upload" && file) {
      finalBlob = file;
    } else if (mode === "record" && audioChunks.length > 0) {
      finalBlob = new Blob(audioChunks, { type: 'audio/webm' });
    }

    if (!finalBlob) return;

    setIsProcessing(true);
    setProgressState({ percent: 15, text: "Uploading secure audio to File Database..." });
    setLiveSegments([]);

    const formData = new FormData();
    formData.append("audio", finalBlob, (mode === "upload" && file) ? file.name : "recording.webm");
    formData.append("title", title || "Untitled Meeting");
    formData.append("mimeType", finalBlob.type || "audio/webm");

    try {
      const res = await fetch("/api/meetings/process", {
        method: "POST",
        body: formData
      });
      
      if (!res.body) throw new Error("No readable stream available.");

      setProgressState({ percent: 30, text: "Analyzing meeting acoustics..." });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let meetingId = "";
      let lastSegmentsLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        
        if (value) {
          accumulated += decoder.decode(value, { stream: true });

          const idMatch = accumulated.match(/__MEETING_ID__:([a-zA-Z0-9-]+)/);
          if (idMatch && !meetingId) {
             meetingId = idMatch[1];
          }

          // Safely extract fully-formed JSON segment strings exactly as they close
          const segmentMatches = accumulated.match(/\{\s*"speakerLabel"[\s\S]*?\}/g);
          if (segmentMatches) {
             const parsedSegments = segmentMatches.map(m => {
                try { return JSON.parse(m); } catch(e) { return null; }
             }).filter(Boolean);
             
             if (parsedSegments.length > lastSegmentsLength) {
                setLiveSegments(parsedSegments as any[]);
                lastSegmentsLength = parsedSegments.length;
                setProgressState({ percent: Math.min(85, 30 + (parsedSegments.length * 3)), text: "Transcribing and translating live stream..." });
             }
          }

          if (accumulated.includes("[DONE]")) {
             break;
          }
        }
        if (done) break;
      }

      setProgressState({ percent: 100, text: "Saving finished intelligence securely..." });

      if (meetingId) {
        setTimeout(() => {
          router.push(`/meetings/${meetingId}`);
        }, 1200);
      }
    } catch (e) {
      console.error("Processing failed:", e);
      setIsProcessing(false);
      setProgressState({ percent: 0, text: "" });
      alert("Something went wrong while processing the audio.");
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const canSubmit = (mode === "upload" && file) || (mode === "record" && audioChunks.length > 0 && !isRecording);

  if (isProcessing) {
    return (
      <div className="flex-1 w-full max-w-4xl mx-auto px-4 flex flex-col items-center justify-center min-h-[70vh]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-8 sm:p-10 w-full rounded-2xl flex flex-col items-center flex-grow max-h-[85vh]"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between w-full mb-8 pb-6 border-b border-border gap-6">
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  {progressState.percent === 100 ? (
                    <CheckCircle2 className="w-6 h-6 text-indigo-500" />
                  ) : (
                    <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                  )}
                </div>
              </div>
              <div className="text-left">
                <h2 className="text-xl font-bold mb-1">{progressState.text}</h2>
                <div className="text-xs text-foreground/50 max-w-xs leading-snug">Listening deeply utilizing Gemini 2.5 Flash architecture to correctly decipher non-English characters.</div>
              </div>
            </div>
            
            <div className="w-full sm:w-1/3 flex flex-col gap-2">
              <div className="w-full bg-surface border border-border h-3 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: "0%" }}
                  animate={{ width: `${progressState.percent}%` }}
                  transition={{ ease: "easeInOut", duration: 0.5 }}
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                />
              </div>
              <div className="w-full text-right text-xs font-bold text-indigo-500">
                {progressState.percent}%
              </div>
            </div>
          </div>
          
          <div className="w-full bg-surface/50 border border-border rounded-xl p-8 flex flex-col items-center justify-center text-center gap-4 animate-in fade-in zoom-in-95 duration-500 mt-4">
            <Mic className="w-10 h-10 text-indigo-500/50 mb-2 animate-bounce" />
            <h3 className="text-lg font-bold">Decoding Acoustics and Linguistics</h3>
            <p className="text-sm text-foreground/60 max-w-md">
              Please keep this screen open while the underlying models seamlessly stream, parse, and commit all localized languages and decisions straight into the database.
            </p>
            {liveSegments.length > 0 && (
              <div className="mt-4 px-4 py-1.5 bg-indigo-500/10 text-indigo-400 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2 border border-indigo-500/20">
                 <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                 {liveSegments.length} Segments Parsed
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-8 flex flex-col pt-12 sm:pt-20">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold mb-3 tracking-tight">Capture Meeting</h1>
        <p className="text-foreground/60">Upload a recording or capture live audio directly.</p>
      </div>

      <div className="glass-panel p-6 sm:p-8 mb-6">
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2 opacity-80">Meeting Title</label>
          <input 
            type="text" 
            placeholder="e.g. Q3 Roadmap Review with External Partners" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium text-lg placeholder:text-foreground/30"
          />
        </div>

        <div className="flex bg-surface p-1 rounded-xl mb-8 border border-border">
          <button 
            onClick={() => setMode("record")}
            className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-all ${mode === "record" ? "bg-background shadow-sm text-indigo-500" : "text-foreground/60 hover:text-foreground"}`}
          >
            <Mic className="w-4 h-4" /> Record
          </button>
          <button 
            onClick={() => setMode("upload")}
            className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-all ${mode === "upload" ? "bg-background shadow-sm text-indigo-500" : "text-foreground/60 hover:text-foreground"}`}
          >
            <UploadCloud className="w-4 h-4" /> Upload
          </button>
        </div>

        <AnimatePresence mode="wait">
          {mode === "record" ? (
            <motion.div 
              key="record"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center justify-center py-6 min-h-[200px]"
            >
              {!isRecording && audioChunks.length === 0 ? (
                <button 
                  onClick={startRecording}
                  className="w-24 h-24 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 border-2 border-indigo-500/50 border-dashed rounded-full flex flex-col items-center justify-center gap-2 transition-all hover:scale-105"
                >
                  <Mic className="w-8 h-8" />
                </button>
              ) : isRecording ? (
                <div className="flex flex-col items-center gap-6">
                  <div className="relative">
                    <div className="w-24 h-24 bg-red-500/10 text-red-500 border border-red-500/30 rounded-full flex items-center justify-center animate-pulse-slow">
                      <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                        <Mic className="w-6 h-6 animate-pulse" />
                      </div>
                    </div>
                  </div>
                  <div className="text-3xl font-mono font-medium tracking-widest bg-background/50 px-4 py-2 rounded-lg border border-border">{formatTime(recordingTime)}</div>
                  <button 
                    onClick={stopRecording}
                    className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/30 px-6 py-2.5 rounded-full font-medium transition-all"
                  >
                    <Square className="w-4 h-4" /> Stop Recording
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="w-16 h-16 bg-green-500/10 border border-green-500/30 text-green-500 rounded-full flex items-center justify-center">
                    <FileAudio className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-green-500">Audio Captured Successfully</h3>
                    <p className="text-sm text-foreground/60">{formatTime(recordingTime)} total duration</p>
                  </div>
                  <button onClick={() => { setAudioChunks([]); setRecordingTime(0); }} className="text-sm text-indigo-500 hover:underline mt-2">
                    Start over
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="min-h-[200px] flex flex-col justify-center"
            >
              <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border hover:border-indigo-500/50 rounded-xl cursor-pointer bg-background/50 hover:bg-surface transition-all">
                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-foreground/60">
                  <UploadCloud className="w-10 h-10 mb-3 text-indigo-500" />
                  <p className="mb-2 text-sm"><span className="font-semibold text-indigo-500">Click to upload</span> or drag and drop</p>
                  <p className="text-xs opacity-70">MP3, M4A, WAV (Max. 50MB)</p>
                </div>
                <input id="file-upload" type="file" className="hidden" accept="audio/*" onChange={handleUpload} />
              </label>
              {file && (
                <div className="mt-4 flex items-center justify-between p-4 bg-background border border-border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-500/10 p-2 rounded-md">
                      <FileAudio className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium line-clamp-1">{file.name}</p>
                      <p className="text-xs text-foreground/50">{(file.size / (1024*1024)).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <button onClick={() => setFile(null)} className="text-xs text-red-500 font-medium hover:underline px-2 py-1">Remove</button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex justify-end">
        <button 
          disabled={!canSubmit || isProcessing}
          onClick={handleSubmit}
          className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all ${
            canSubmit && !isProcessing 
            ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25" 
            : "bg-surface text-foreground/40 cursor-not-allowed border border-border"
          }`}
        >
          <Sparkles className="w-4 h-4" /> Process Audio <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

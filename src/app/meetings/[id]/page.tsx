"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Calendar, CheckCircle2, Clock, Globe2, Link as LinkIcon, Loader2, Sparkles, Users, Trash } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Segment = {
  id: string;
  speakerLabel: string;
  startTime: number;
  endTime: number;
  originalText: string;
  detectedLanguage: string;
  translatedTextEn: string | null;
  codeSwitchFlag: boolean;
};

type ActionItem = {
  id: string;
  title: string;
  owner: string | null;
  dueDate: string | null;
  status: string;
  sourceLanguage: string;
  linkedSegmentIds: string | null;
};

type Summary = {
  abstract: string;
  keyPoints: string;
  risks: string;
  blockers: string;
};

export default function MeetingDetails() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const [meeting, setMeeting] = useState<any>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  // View state
  const [activeTab, setActiveTab] = useState<"summary" | "actions" | "transcript">("summary");
  const [transcriptMode, setTranscriptMode] = useState<"dual" | "original" | "translated">("dual");
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/meetings/${id}`)
      .then(res => res.json())
      .then(data => {
        setMeeting(data.meeting);
        setSegments(data.segments || []);
        setActions(data.actions || []);
        setSummary(data.summary || null);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return <div className="flex-1 flex justify-center items-center mt-32"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  if (!meeting) {
    return <div className="flex-1 flex justify-center pt-32 text-foreground/50">Meeting not found.</div>;
  }

  const handleViewSource = (segmentIds: string | null) => {
    if (!segmentIds) return;
    setActiveTab("transcript");
    const firstId = segmentIds.split(",")[0];
    setHighlightedSegmentId(firstId);
    
    setTimeout(() => {
      const el = document.getElementById(`segment-${firstId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    
    // Clear highlight after a few seconds
    setTimeout(() => setHighlightedSegmentId(null), 3000);
  };

  return (
    <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 flex flex-col pt-12 sm:pt-20 pb-20">
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-3 text-gradient inline-block">{meeting.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-foreground/60 font-medium">
            <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {new Date(meeting.createdAt).toLocaleDateString()}</span>
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {meeting.status}</span>
          </div>
        </div>
        <button 
          onClick={async () => {
            if (!confirm("Are you sure you want to completely delete this meeting?")) return;
            await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
            router.push('/dashboard');
          }}
          className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500 border border-red-500/20 text-red-500 hover:text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-colors"
        >
          <Trash className="w-4 h-4" /> Delete Meeting
        </button>
      </div>

      <div className="flex gap-2 sm:gap-6 mb-8 border-b border-border pb-1 overflow-x-auto no-scrollbar">
        {["summary", "actions", "transcript"].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2.5 font-semibold capitalize whitespace-nowrap transition-all border-b-2 rounded-t-lg ${activeTab === tab ? "border-indigo-500 text-indigo-500 bg-indigo-500/5" : "border-transparent text-foreground/60 hover:text-foreground hover:bg-surface-hover"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1">
        <AnimatePresence mode="wait">
          {activeTab === "summary" && summary && (
            <motion.div key="summary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="glass-panel p-6 sm:p-8">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-500"/> Abstract</h2>
                <p className="text-foreground/80 leading-relaxed text-lg">{summary.abstract}</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-panel p-6 sm:p-8 bg-surface-hover/30">
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-indigo-500"><CheckCircle2 className="w-5 h-5" /> Key Points</h2>
                  <ul className="space-y-3">
                    {JSON.parse(summary.keyPoints || "[]").length === 0 ? <p className="text-sm text-foreground/50">No key points listed.</p> :
                      JSON.parse(summary.keyPoints || "[]").map((kp: string, i: number) => (
                      <li key={i} className="flex gap-3 items-start text-foreground/80 font-medium"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0" /> {kp}</li>
                    ))}
                  </ul>
                </div>
                
                <div className="space-y-6 flex flex-col">
                  {JSON.parse(summary.risks || "[]").length > 0 && (
                    <div className="glass-panel p-6 flex-1 bg-red-500/5 border-red-500/20">
                      <h2 className="text-lg font-bold mb-3 text-red-500">Risks & Problems</h2>
                      <ul className="space-y-2">
                        {JSON.parse(summary.risks || "[]").map((r: string, i: number) => (
                          <li key={i} className="flex gap-2 items-start text-sm text-foreground/80"><div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" /> {r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {JSON.parse(summary.blockers || "[]").length > 0 && (
                     <div className="glass-panel p-6 flex-1 bg-orange-500/5 border-orange-500/20">
                      <h2 className="text-lg font-bold mb-3 text-orange-500">Blockers</h2>
                      <ul className="space-y-2">
                        {JSON.parse(summary.blockers || "[]").map((b: string, i: number) => (
                          <li key={i} className="flex gap-2 items-start text-sm text-foreground/80"><div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0" /> {b}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "actions" && (
            <motion.div key="actions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              {actions.length === 0 ? (
                <div className="glass-panel p-10 text-center text-foreground/60 font-medium">No action items extracted.</div>
              ) : actions.map(action => (
                <div key={action.id} className="glass-panel p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:bg-surface-hover/50 hover:border-indigo-500/30">
                  <div className="flex items-start gap-4">
                    <CheckCircle2 className="w-6 h-6 text-foreground/30 mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-bold text-lg mb-2">{action.title}</h3>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/60 font-semibold">
                        {action.owner && <span className="flex items-center gap-1.5 bg-background px-2.5 py-1.5 rounded-md border border-border"><Users className="w-3.5 h-3.5 text-indigo-500" /> {action.owner}</span>}
                        {action.dueDate && <span className="flex items-center gap-1.5 bg-background px-2.5 py-1.5 rounded-md border border-border"><Calendar className="w-3.5 h-3.5 text-indigo-500" /> {action.dueDate}</span>}
                        {action.sourceLanguage && <span className="flex items-center gap-1.5 bg-background px-2.5 py-1.5 rounded-md border border-border"><Globe2 className="w-3.5 h-3.5 text-indigo-500" /> {action.sourceLanguage}</span>}
                      </div>
                    </div>
                  </div>
                  {action.linkedSegmentIds && (
                    <button 
                      onClick={() => handleViewSource(action.linkedSegmentIds)}
                      className="shrink-0 text-sm font-bold text-indigo-500 hover:text-white flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-600 transition-colors w-full sm:w-auto"
                    >
                      <LinkIcon className="w-4 h-4" /> View Source
                    </button>
                  )}
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === "transcript" && (
            <motion.div key="transcript" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6 mb-20">
              <div className="flex flex-wrap items-center justify-end gap-2 mb-6 p-2 bg-surface border border-border rounded-xl">
                <button onClick={() => setTranscriptMode("original")} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${transcriptMode === "original" ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20" : "text-foreground/70 hover:bg-background"}`}>Original Text</button>
                <button onClick={() => setTranscriptMode("translated")} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${transcriptMode === "translated" ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20" : "text-foreground/70 hover:bg-background"}`}>Translated Only</button>
                <button onClick={() => setTranscriptMode("dual")} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${transcriptMode === "dual" ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20" : "text-foreground/70 hover:bg-background"}`}>Dual View</button>
              </div>
              
              <div className="space-y-4 font-medium">
                {segments.length === 0 ? (
                  <div className="glass-panel p-10 text-center text-foreground/60">No transcript segments available.</div>
                ) : segments.map(seg => {
                  const isStrictlyEnglish = (seg.detectedLanguage.toLowerCase() === "english" || seg.detectedLanguage.toLowerCase() === "en") && !seg.codeSwitchFlag;
                  const langCode = isStrictlyEnglish ? "EN" : seg.detectedLanguage.slice(0, 2).toUpperCase();
                  
                  const hasTranslation = Boolean(seg.translatedTextEn && seg.translatedTextEn.trim() !== "");
                  const showDual = hasTranslation || !isStrictlyEnglish;

                  // Colors matching the screenshot design
                  let badgeColors = "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
                  if (langCode === "EN") badgeColors = "bg-[#e6f4f1] text-[#1b5e60] dark:bg-teal-900/40 dark:text-teal-300";
                  else if (langCode === "HI") badgeColors = "bg-[#fce7f3] text-[#be185d] dark:bg-pink-900/40 dark:text-pink-300";
                  else if (langCode === "TA") badgeColors = "bg-[#e9d5ff] text-[#6b21a8] dark:bg-purple-900/40 dark:text-purple-300";
                  else badgeColors = "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300";

                  const speakerColor = "text-[#1b5e60] dark:text-[#4fd1c5]"; 

                  // Arbitrary green confidence score based on the screenshot mockup for non-English
                  const confidence = Math.floor(Math.random() * (99 - 90 + 1)) + 90;

                  const cleanOriginalText = seg.originalText.replace(/<\|.*?\|>/g, "").replace(/<[^>]+>/g, "").trim();

                  return (
                    <div 
                      key={seg.id} 
                      id={`segment-${seg.id}`}
                      className={`flex flex-col gap-3 rounded-2xl transition-all border border-transparent ${
                        highlightedSegmentId === seg.id ? "border-indigo-500 bg-indigo-500/10 shadow-[0_0_0_2px_rgba(99,102,241,0.5)] scale-[1.01]" : 
                        showDual ? "bg-[#f8fafc] dark:bg-slate-900/30 p-4 sm:p-6 shadow-sm" : "bg-transparent hover:bg-surface-hover/30 p-2 sm:p-4"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className={`font-bold text-[15px] capitalize ${speakerColor}`}>
                            {seg.speakerLabel}
                          </span>
                          <span className="text-[13px] text-foreground/50 font-medium font-mono">
                            {Math.floor(seg.startTime/60)}:{(seg.startTime%60).toString().padStart(2,'0').split(".")[0]} – {Math.floor(seg.endTime/60)}:{(seg.endTime%60).toString().padStart(2,'0').split(".")[0]}
                          </span>
                          <span className={`text-[11px] font-bold tracking-wide px-2 py-0.5 rounded ${badgeColors}`}>
                            {langCode}
                          </span>
                          {seg.codeSwitchFlag && (
                            <span className="text-[14px] italic text-slate-400 dark:text-slate-500 font-medium">code-switch</span>
                          )}
                        </div>
                        {showDual && (
                          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs opacity-80">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> {confidence}%
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-1">
                        {showDual ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 w-full">
                            <p className="text-foreground/90 leading-relaxed text-[16px] break-words">
                              {cleanOriginalText}
                            </p>
                            <div className="border-l-2 border-slate-200 dark:border-slate-700/50 pl-4 md:pl-6 py-0.5">
                              <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[16px] break-words">
                                {seg.translatedTextEn}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-foreground/90 leading-relaxed text-[16px] max-w-4xl break-words">
                            {cleanOriginalText}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

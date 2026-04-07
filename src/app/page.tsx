"use client";

import Link from "next/link";
import { Mic, FileAudio, ArrowRight, Languages, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center pt-20 pb-16 px-4 sm:px-6 lg:px-8 w-full max-w-7xl mx-auto">
      
      {/* Hero Section */}
      <div className="text-center max-w-3xl mb-16">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-500 text-sm font-medium mb-6 border border-indigo-500/20"
        >
          <Sparkles className="w-4 h-4" />
          <span>Multilingual AI Meeting Intelligence</span>
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-6 leading-tight"
        >
          Never lose context in <br className="hidden sm:block" />
          <span className="text-gradient">mixed-language</span> meetings.
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-lg text-foreground/70 mb-10 max-w-2xl mx-auto"
        >
          PolyNotes records live audio, detects language shifts, transcribes seamlessly, and extracts action items without losing the original meaning.
        </motion.p>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link href="/new?mode=record" className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3.5 rounded-full font-medium transition-all hover:shadow-lg hover:shadow-indigo-500/25">
            <Mic className="w-5 h-5" />
            Start Recording
          </Link>
          <Link href="/new?mode=upload" className="w-full sm:w-auto flex items-center justify-center gap-2 bg-surface hover:bg-surfaceHover border border-border px-8 py-3.5 rounded-full font-medium transition-all">
            <FileAudio className="w-5 h-5" />
            Upload Audio
          </Link>
        </motion.div>
      </div>

      {/* Feature grid */}
      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.5 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-12"
      >
        <div className="glass-panel p-6 flex flex-col items-start text-left transition-transform hover:-translate-y-1">
          <div className="bg-blue-500/10 p-3 rounded-lg text-blue-500 mb-4">
            <Languages className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Code-Switching Support</h3>
          <p className="text-foreground/70 text-sm">Detects shifts between English and regional languages mid-sentence and transcribes accurately.</p>
        </div>
        
        <div className="glass-panel p-6 flex flex-col items-start text-left transition-transform hover:-translate-y-1">
          <div className="bg-purple-500/10 p-3 rounded-lg text-purple-500 mb-4">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Actionable Insights</h3>
          <p className="text-foreground/70 text-sm">Generates meeting summaries, decisions, and tasks traceable directly to the transcript.</p>
        </div>

        <div className="glass-panel p-6 flex flex-col items-start text-left transition-transform hover:-translate-y-1">
          <div className="bg-green-500/10 p-3 rounded-lg text-green-500 mb-4">
            <ArrowRight className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Original Context</h3>
          <p className="text-foreground/70 text-sm">Keeps the original spoken language while providing English translations side-by-side.</p>
        </div>
      </motion.div>

    </div>
  );
}

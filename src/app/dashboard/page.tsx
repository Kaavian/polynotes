"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Clock, Loader2, Plus, Trash } from "lucide-react";

type Meeting = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
};

export default function Dashboard() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/meetings")
      .then(res => res.json())
      .then(data => {
        setMeetings(data.meetings || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-4 py-8 flex flex-col pt-12 sm:pt-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Your Meetings</h1>
          <p className="text-foreground/60 font-medium">All recorded and processed multilingual meetings.</p>
        </div>
        <Link href="/new" className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-full font-bold transition-all shadow-lg shadow-indigo-500/20">
          <Plus className="w-5 h-5" /> New Meeting
        </Link>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
      ) : meetings.length === 0 ? (
        <div className="glass-panel p-16 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-surface border border-border rounded-full flex items-center justify-center mb-4">
            <Calendar className="w-8 h-8 text-foreground/40" />
          </div>
          <h3 className="text-xl font-bold mb-2">No meetings yet</h3>
          <p className="text-foreground/60 mb-6 max-w-md font-medium">You haven&apos;t recorded or uploaded any meetings. Start capturing your multilingual calls to generate insights.</p>
          <Link href="/new" className="font-bold text-indigo-500 hover:text-indigo-400">Capture your first meeting &rarr;</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {meetings.map((m) => (
            <div key={m.id} className="relative group">
              <Link href={`/meetings/${m.id}`} className="block h-full">
                <div className="glass-panel p-6 h-full transition-all hover:bg-surface-hover hover:border-indigo-500/30 hover:-translate-y-1">
                  <div className="flex justify-between items-start mb-4">
                    <div className={`text-[10px] font-extrabold tracking-widest uppercase px-2 py-1 rounded-md ${m.status === "COMPLETED" ? "bg-green-500/10 text-green-500" : "bg-amber-500/10 text-amber-500"}`}>
                      {m.status}
                    </div>
                  </div>
                  <h3 className="text-lg font-bold mb-4 line-clamp-2 group-hover:text-indigo-500 transition-colors leading-snug pr-8">{m.title}</h3>
                  <div className="flex items-center gap-4 text-xs text-foreground/50 font-semibold mt-auto pt-4 border-t border-border">
                    <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {new Date(m.createdAt).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </Link>
              <button 
                onClick={async (e) => {
                  e.preventDefault();
                  if (!confirm("Delete this meeting?")) return;
                  await fetch(`/api/meetings/${m.id}`, { method: 'DELETE' });
                  setMeetings(prev => prev.filter(x => x.id !== m.id));
                }}
                className="absolute top-4 right-4 p-2 text-foreground/20 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 z-10"
              >
                <Trash className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

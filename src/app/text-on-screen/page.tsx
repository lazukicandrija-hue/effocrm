"use client";

import { useState, useRef, useCallback } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, Copy, Check, Sparkles, Trash2, AlertTriangle, Type } from "lucide-react";

const MAX_CONCURRENT = 2;

type Job = {
  id: string;
  label: string;
  kind: "file" | "link";
  file?: File;
  url?: string;
  status: "pending" | "working" | "done" | "error";
  hooks?: string[];
  thumb?: string;
  error?: string;
};

// Sample `count` frames across a video file, entirely in the browser.
function extractFrames(file: File, count = 5): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    (video as any).playsInline = true;
    const canvas = document.createElement("canvas");
    const frames: string[] = [];
    let times: number[] = [];
    let idx = 0;
    const cleanup = () => URL.revokeObjectURL(url);
    const grab = () => {
      try {
        const w = Math.min(video.videoWidth || 480, 480);
        canvas.width = w;
        canvas.height = Math.round(w * ((video.videoHeight || 854) / (video.videoWidth || 480)));
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL("image/jpeg", 0.7));
        }
      } catch {
        /* skip this frame */
      }
      idx++;
      if (idx < times.length) {
        video.currentTime = times[idx];
      } else {
        cleanup();
        frames.length ? resolve(frames) : reject(new Error("Couldn't read this video."));
      }
    };
    video.onloadedmetadata = () => {
      const d = video.duration || 1;
      times = Array.from({ length: count }, (_, i) => Math.min(d * ((i + 0.5) / count), Math.max(0, d - 0.05)));
      video.currentTime = times[0];
    };
    video.onseeked = grab;
    video.onerror = () => {
      cleanup();
      reject(new Error("The browser couldn't read this video file."));
    };
    video.src = url;
  });
}

export default function TextOnScreenPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [links, setLinks] = useState("");
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);

  const nid = () => `j${idRef.current++}`;

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const add: Job[] = Array.from(files)
      .filter((f) => f.type.startsWith("video/"))
      .map((f) => ({ id: nid(), label: f.name, kind: "file", file: f, status: "pending" }));
    if (add.length) setJobs((xs) => [...xs, ...add]);
  };

  const addLinks = () => {
    const urls = links
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u));
    if (!urls.length) return;
    setJobs((xs) => [...xs, ...urls.map((u) => ({ id: nid(), label: u, kind: "link" as const, url: u, status: "pending" as const }))]);
    setLinks("");
  };

  const runOne = useCallback(async (job: Job) => {
    setJobs((xs) => xs.map((j) => (j.id === job.id ? { ...j, status: "working", error: undefined } : j)));
    try {
      let body: any;
      if (job.kind === "file" && job.file) {
        const frames = await extractFrames(job.file);
        body = { frames };
      } else {
        body = { url: job.url };
      }
      const res = await fetch("/api/text-on-screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setJobs((xs) =>
        xs.map((j) => (j.id === job.id ? { ...j, status: "done", hooks: d.hooks || [], thumb: d.thumb } : j))
      );
    } catch (e: any) {
      setJobs((xs) => xs.map((j) => (j.id === job.id ? { ...j, status: "error", error: e?.message || "Failed" } : j)));
    }
  }, []);

  const generate = useCallback(async () => {
    setRunning(true);
    // snapshot pending jobs, run with limited concurrency
    const pending = jobs.filter((j) => j.status === "pending" || j.status === "error");
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const job = pending[cursor++];
        await runOne(job);
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, pending.length) }, worker));
    setRunning(false);
  }, [jobs, runOne]);

  const remove = (id: string) => setJobs((xs) => xs.filter((j) => j.id !== id));
  const clearDone = () => setJobs((xs) => xs.filter((j) => j.status !== "done"));

  const copyHook = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1300);
    } catch {
      /* ignore */
    }
  };

  const pendingCount = jobs.filter((j) => j.status === "pending" || j.status === "error").length;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Type className="h-6 w-6" /> Text-On-Screen
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload reels (or paste links) and get <b>3–5 flirty text-on-screen hook ideas</b> for each — your
            assistant adds the winner in CapCut. English hooks, tuned to what&apos;s in the reel.
          </p>
        </div>

        {/* Add reels */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <label
                className="inline-flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium text-white cursor-pointer"
                style={{ backgroundColor: "#0a0a0a" }}
              >
                <Upload className="h-4 w-4" /> Upload reels
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="text-xs text-gray-400">Add several at once — they batch.</span>
            </div>
            <div className="space-y-1.5">
              <Label>…or paste reel links (one per line)</Label>
              <div className="flex gap-2">
                <textarea
                  value={links}
                  onChange={(e) => setLinks(e.target.value)}
                  placeholder={"https://www.instagram.com/reel/…\nhttps://www.tiktok.com/…"}
                  rows={2}
                  className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm bg-white resize-y"
                />
                <Button onClick={addLinks} variant="outline" className="self-start">
                  Add
                </Button>
              </div>
            </div>
            {jobs.length > 0 && (
              <div className="flex items-center gap-3 pt-1">
                <Button
                  onClick={generate}
                  disabled={running || pendingCount === 0}
                  className="gap-2"
                  style={{ backgroundColor: "#0a0a0a", color: "#f5e6c8" }}
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {running ? "Reading reels…" : `Generate ideas (${pendingCount})`}
                </Button>
                {jobs.some((j) => j.status === "done") && (
                  <button onClick={clearDone} className="text-xs text-gray-400 hover:text-gray-600">
                    Clear finished
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {jobs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Type className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Upload a few reels (or paste links), then hit Generate ideas.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <Card key={job.id} className="overflow-hidden">
                <CardContent className="p-4 flex gap-4">
                  <div className="w-16 flex-shrink-0">
                    {job.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={job.thumb} alt="" className="w-16 h-20 object-cover rounded-md border border-gray-100 bg-gray-50" />
                    ) : (
                      <div className="w-16 h-20 rounded-md bg-gray-100 flex items-center justify-center">
                        {job.status === "working" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        ) : (
                          <Type className="h-4 w-4 text-gray-300" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-gray-400 truncate">{job.label}</p>
                      <button onClick={() => remove(job.id)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {job.status === "working" && (
                      <p className="text-sm text-amber-500 flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the reel + writing hooks…
                      </p>
                    )}
                    {job.status === "pending" && <p className="text-sm text-gray-400">Queued — hit Generate ideas.</p>}
                    {job.status === "error" && (
                      <p className="text-sm text-red-500 flex items-start gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> {job.error}
                      </p>
                    )}
                    {job.status === "done" &&
                      (job.hooks || []).map((h, i) => {
                        const key = job.id + ":" + i;
                        return (
                          <button
                            key={key}
                            onClick={() => copyHook(key, h)}
                            className="group w-full flex items-center gap-2 text-left rounded-lg border border-gray-100 hover:border-[#d4a853]/50 hover:bg-[#d4a853]/[0.04] px-3 py-2 transition-colors"
                          >
                            <span className="flex-1 text-sm text-gray-800">{h}</span>
                            {copied === key ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 text-gray-300 group-hover:text-[#d4a853] flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

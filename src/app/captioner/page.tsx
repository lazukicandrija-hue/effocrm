"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Type, Loader2, Upload, AlertTriangle, X } from "lucide-react";

type Job = {
  id: string;
  label: string;
  kind: "link" | "file";
  file?: File;
  url?: string;
  status: "queued" | "uploading" | "starting" | "captioning" | "done" | "failed";
  jobId?: string;
  resultUrl?: string;
  error?: string;
};

const MAX_CONCURRENT = 2; // don't overload the caption server
const ACTIVE = new Set(["queued", "uploading", "starting", "captioning"]);
const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  uploading: "Uploading…",
  starting: "Starting…",
  captioning: "Adding captions…",
  done: "Done",
  failed: "Failed",
};

const cid = () => Math.random().toString(36).slice(2);

export default function CaptionerPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [links, setLinks] = useState("");
  const jobsRef = useRef<Job[]>([]);
  jobsRef.current = jobs;
  const startingRef = useRef<Set<string>>(new Set());

  const update = (id: string, patch: Partial<Job>) =>
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  const addLinks = () => {
    const urls = links
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((u) => /^https?:\/\//i.test(u));
    if (!urls.length) return;
    setJobs((js) => [
      ...urls.map((u) => ({ id: cid(), label: u, kind: "link" as const, url: u, status: "queued" as const })),
      ...js,
    ]);
    setLinks("");
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files)
      .filter((f) => f.type.startsWith("video/"))
      .map((f) => ({ id: cid(), label: f.name, kind: "file" as const, file: f, status: "queued" as const }));
    if (arr.length) setJobs((js) => [...arr, ...js]);
  };

  const startJob = useCallback(async (job: Job) => {
    try {
      let key: string | undefined;
      if (job.kind === "file" && job.file) {
        update(job.id, { status: "uploading" });
        const r = await fetch("/api/captions/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: job.file.name, contentType: job.file.type }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "upload URL failed");
        const put = await fetch(d.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": job.file.type || "video/mp4" },
          body: job.file,
        });
        if (!put.ok) throw new Error("upload failed");
        key = d.key;
      }
      update(job.id, { status: "starting" });
      const r2 = await fetch("/api/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(key ? { key } : { url: job.url }),
      });
      const d2 = await r2.json();
      if (!r2.ok || !d2.jobId) throw new Error(d2.error || "couldn't start");
      update(job.id, { status: "captioning", jobId: d2.jobId });
    } catch (e: any) {
      update(job.id, { status: "failed", error: e?.message || "failed" });
    }
  }, []);

  // Runner — keep up to MAX_CONCURRENT jobs moving; start queued ones as slots free.
  useEffect(() => {
    const active = jobs.filter((j) => j.status !== "queued" && ACTIVE.has(j.status)).length;
    if (active >= MAX_CONCURRENT) return;
    const next = jobs.find((j) => j.status === "queued" && !startingRef.current.has(j.id));
    if (!next) return;
    startingRef.current.add(next.id);
    startJob(next).finally(() => startingRef.current.delete(next.id));
  }, [jobs, startJob]);

  // Poll captioning jobs until done/failed.
  useEffect(() => {
    if (!jobs.some((j) => j.status === "captioning" && j.jobId)) return;
    const id = setInterval(async () => {
      const current = jobsRef.current.filter((j) => j.status === "captioning" && j.jobId);
      await Promise.all(
        current.map(async (j) => {
          try {
            const r = await fetch(`/api/captions/${j.jobId}`);
            const d = await r.json();
            if (d.status === "done" && d.url) update(j.id, { status: "done", resultUrl: d.url });
            else if (d.status === "error" || d.status === "gone")
              update(j.id, { status: "failed", error: d.error || "captioning failed" });
          } catch {
            /* keep polling */
          }
        })
      );
    }, 4000);
    return () => clearInterval(id);
  }, [jobs]);

  const remove = (id: string) => setJobs((js) => js.filter((j) => j.id !== id));

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Captioner</h1>
          <p className="text-sm text-gray-500 mt-1">
            Add CapCut-style captions to any video that doesn&apos;t have them — paste a reel link
            or upload a file. It transcribes the speech and burns the captions on, ready to post.
          </p>
        </div>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-2">
              <Label>Reel / video links (one per line)</Label>
              <Textarea
                placeholder={"https://www.instagram.com/reel/…\nhttps://…"}
                value={links}
                onChange={(e) => setLinks(e.target.value)}
                className="min-h-[80px] font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={addLinks} disabled={!links.trim()} className="gap-2">
                <Type className="h-4 w-4" />
                Caption links
              </Button>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 cursor-pointer">
                <Upload className="h-4 w-4" />
                Upload videos
                <input
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
              <span className="text-xs text-gray-400">Needs spoken audio — silent clips come out uncaptioned.</span>
            </div>
          </CardContent>
        </Card>

        {jobs.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((job) => {
              const active = ACTIVE.has(job.status);
              return (
                <Card key={job.id} className="relative overflow-hidden flex flex-col">
                  <button
                    onClick={() => remove(job.id)}
                    title="Remove"
                    className="absolute top-1.5 right-1.5 z-10 p-1 rounded-full bg-black/40 text-gray-300 hover:bg-red-500 hover:text-white transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  {job.status === "done" && job.resultUrl ? (
                    <div className="bg-black">
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <video
                        src={job.resultUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full aspect-[9/16] object-contain bg-black"
                      />
                    </div>
                  ) : (
                    <div className="aspect-[9/16] bg-gray-900 flex flex-col items-center justify-center gap-3 text-center px-4">
                      {job.status === "failed" ? (
                        <AlertTriangle className="h-8 w-8 text-red-400" />
                      ) : (
                        <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                      )}
                      <span className="text-xs font-medium text-gray-300">
                        {STATUS_LABEL[job.status]}
                      </span>
                    </div>
                  )}

                  <CardContent className="p-2.5 flex flex-col gap-1.5 flex-1">
                    <span className="text-[11px] text-gray-600 font-medium truncate" title={job.label}>
                      {job.kind === "file" ? "📄 " : "🔗 "}
                      {job.label}
                    </span>
                    {job.status === "failed" && job.error && (
                      <p title={job.error} className="text-[11px] text-red-500 line-clamp-2">
                        {job.error}
                      </p>
                    )}
                    {job.status === "done" && job.resultUrl && (
                      <a
                        href={job.resultUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-medium text-[#d4a853] hover:underline self-start"
                      >
                        Open / download ↗
                      </a>
                    )}
                    {active && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        {STATUS_LABEL[job.status]}
                      </span>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

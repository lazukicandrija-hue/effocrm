"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";
import {
  Wand2,
  Loader2,
  ExternalLink,
  AlertTriangle,
  UserCircle,
} from "lucide-react";

const STATUS_META: Record<string, { label: string; color: string }> = {
  QUEUED: { label: "Queued", color: "#6b7280" },
  PREPPING: { label: "Downloading reel…", color: "#3b82f6" },
  IMAGE_WAIT: { label: "Making Poppy image…", color: "#a855f7" },
  MOTION_WAIT: { label: "Rendering reel (7–10 min)…", color: "#d4a853" },
  DONE: { label: "Done", color: "#16a34a" },
  FAILED: { label: "Failed", color: "#dc2626" },
};
const ACTIVE = new Set(["QUEUED", "PREPPING", "IMAGE_WAIT", "MOTION_WAIT"]);

export default function AutoRecreatePage() {
  const [items, setItems] = useState<any[]>([]);
  const [links, setLinks] = useState("");
  const [prompt, setPrompt] = useState("");
  const [ready, setReady] = useState<{ ok: boolean; reason?: string }>({ ok: true });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/recreations");
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      if (data.ready) setReady(data.ready);
      if (data.defaultPrompt) setPrompt((p) => p || data.defaultPrompt);
    } catch {
      /* keep prior */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // While any job is in flight, drive the pipeline: tick + refetch every 10s.
  const anyActive = items.some((i) => ACTIVE.has(i.status));
  useEffect(() => {
    if (!anyActive) return;
    let alive = true;
    const loop = async () => {
      try {
        await fetch("/api/recreations/tick", { method: "POST" });
      } catch {
        /* ignore */
      }
      if (alive) await fetchItems();
    };
    const id = setInterval(loop, 10000);
    loop();
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [anyActive, fetchItems]);

  const submit = async () => {
    const urls = links
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!urls.length || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/recreations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, prompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to queue");
        return;
      }
      setLinks("");
      fetchItems();
    } catch {
      alert("Failed to queue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Auto-Recreate</h1>
          <p className="text-sm text-gray-500 mt-1">
            Paste a reel link and it runs the whole pipeline on its own — first frame → Poppy
            image → Motion Control → finished reel. No hands needed.
          </p>
        </div>

        {!ready.ok && (
          <Card>
            <CardContent className="p-4 flex items-start gap-2 text-sm text-amber-600 bg-amber-50">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>Pipeline not ready yet ({ready.reason}). Queuing is disabled until it&apos;s connected.</span>
            </CardContent>
          </Card>
        )}

        {/* Input */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-2">
              <Label>Reel links (one per line)</Label>
              <Textarea
                placeholder={"https://www.instagram.com/reel/…\nhttps://www.instagram.com/reel/…"}
                value={links}
                onChange={(e) => setLinks(e.target.value)}
                className="min-h-[90px] font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Image-edit prompt (applied to every reel)</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[48px] text-sm"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={submit} disabled={submitting || !ready.ok || !links.trim()} className="gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Recreate
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Jobs */}
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : items.length === 0 ? null : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((job) => {
              const st = STATUS_META[job.status] || STATUS_META.QUEUED;
              const active = ACTIVE.has(job.status);
              return (
                <Card key={job.id} className="overflow-hidden flex flex-col">
                  {job.status === "DONE" && job.finalVideoUrl ? (
                    <div className="bg-black">
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <video
                        src={job.finalVideoUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full aspect-[9/16] object-contain bg-black"
                      />
                    </div>
                  ) : (
                    <div className="aspect-[9/16] bg-gray-900 flex flex-col items-center justify-center gap-3 text-center px-4">
                      {job.status === "FAILED" ? (
                        <AlertTriangle className="h-8 w-8 text-red-400" />
                      ) : (
                        <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                      )}
                      <span className="text-xs font-medium" style={{ color: st.color }}>
                        {job.stage || st.label}
                      </span>
                    </div>
                  )}

                  <CardContent className="p-2.5 flex flex-col gap-1.5 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ backgroundColor: `${st.color}18`, color: st.color }}
                      >
                        {active && <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />}
                        {st.label}
                      </span>
                      <a
                        href={job.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Source reel"
                        className="text-gray-400 hover:text-[#d4a853]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>

                    {job.status === "FAILED" && job.error && (
                      <p title={job.error} className="text-[11px] text-red-500 line-clamp-2">
                        {job.error}
                      </p>
                    )}

                    {job.status === "DONE" && job.finalVideoUrl && (
                      <a
                        href={job.finalVideoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-medium text-[#d4a853] hover:underline"
                      >
                        Open / download reel ↗
                      </a>
                    )}

                    <div className="mt-auto pt-1 flex items-center justify-between gap-1 text-[10px] text-gray-400">
                      {job.addedBy ? (
                        <span className="inline-flex items-center gap-0.5 text-gray-600 font-medium truncate">
                          <UserCircle className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{job.addedBy}</span>
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                      <span className="flex-shrink-0">{formatDate(job.createdAt)}</span>
                    </div>
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

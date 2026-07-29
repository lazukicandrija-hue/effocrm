"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BookMarked, Upload, Trash2, Loader2, Eye, Film, Sparkles, Check } from "lucide-react";

const FALLBACK_NICHES = ["McDonald's", "Starbucks", "Chipotle", "Waitress", "Delivery Girl", "Cashier"];

type Example = {
  id: string;
  prompt: string;
  niche: string | null;
  imageDesc: string | null;
  reelUrl: string | null;
  views: number | null;
  note: string | null;
  createdAt: string;
  url: string | null;
};

export default function PromptLibraryPage() {
  const [items, setItems] = useState<Example[]>([]);
  const [loading, setLoading] = useState(true);
  const [niches, setNiches] = useState<string[]>(FALLBACK_NICHES);

  // form state
  const [prompt, setPrompt] = useState("");
  const [niche, setNiche] = useState("");
  const [reelUrl, setReelUrl] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const r = await fetch("/api/brain/examples");
      const d = await r.json();
      setItems(Array.isArray(d.items) ? d.items : []);
    } catch {
      /* keep prior */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    fetch("/api/brain/ideas")
      .then((r) => r.json())
      .then((d) => Array.isArray(d.niches) && d.niches.length && setNiches(d.niches))
      .catch(() => {});
  }, [fetchItems]);

  const save = async () => {
    if (!prompt.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      let imageKey: string | undefined;
      if (file) {
        const r = await fetch("/api/brain/examples/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Upload URL failed");
        const put = await fetch(d.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!put.ok) throw new Error("Image upload failed");
        imageKey = d.key;
      }
      const res = await fetch("/api/brain/examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          niche: niche.trim() || null,
          imageKey,
          reelUrl: reelUrl.trim() || null,
          note: note.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't save");
      // clear
      setPrompt("");
      setReelUrl("");
      setNote("");
      setFile(null);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
      await fetchItems();
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this example? The brain will stop learning from it.")) return;
    setItems((xs) => xs.filter((i) => i.id !== id));
    try {
      await fetch(`/api/brain/examples/${id}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookMarked className="h-6 w-6" /> Prompt Library
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Save your best reels here — the prompt, the reference image, and the finished reel. The Content
            Brain reads these every time it generates and copies what works. The more winners you add, the
            sharper it gets.
          </p>
        </div>

        {/* Add form */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label>Prompt you used *</Label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Paste the exact Seedance/Kling prompt you used for this reel…"
                rows={3}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white resize-y"
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1.5">
                <Label>Niche / setting</Label>
                <input
                  list="pl-niches"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="e.g. Starbucks"
                  className="h-9 w-44 rounded-md border border-gray-200 px-3 text-sm bg-white"
                />
                <datalist id="pl-niches">
                  {niches.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5 flex-1 min-w-[220px]">
                <Label>Finished reel link (auto-pulls views if it&apos;s a tracked account)</Label>
                <input
                  value={reelUrl}
                  onChange={(e) => setReelUrl(e.target.value)}
                  placeholder="https://www.instagram.com/reel/…"
                  className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm bg-white"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1.5">
                <Label>Reference image</Label>
                <label className="inline-flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 cursor-pointer hover:bg-gray-50">
                  <Upload className="h-4 w-4" />
                  {file ? file.name.slice(0, 24) : "Upload image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
              <div className="space-y-1.5 flex-1 min-w-[220px]">
                <Label>Note (optional)</Label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder='e.g. "the slow lean-in crushed"'
                  className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm bg-white"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={save}
                disabled={saving || !prompt.trim()}
                className="gap-2"
                style={{ backgroundColor: "#0a0a0a", color: "#f5e6c8" }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : justSaved ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {saving ? "Saving + reading image…" : justSaved ? "Saved!" : "Teach the brain"}
              </Button>
              {error && <span className="text-sm text-red-600">{error}</span>}
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">
            {items.length} example{items.length === 1 ? "" : "s"} the brain is learning from
          </p>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400">
              Nothing yet — add your first proven reel above and the brain starts learning immediately.
            </p>
          ) : (
            <div className="space-y-3">
              {items.map((ex) => (
                <Card key={ex.id} className="overflow-hidden">
                  <CardContent className="p-4 flex gap-4">
                    {ex.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ex.url}
                        alt="reference"
                        className="w-20 h-24 rounded-md object-cover border border-gray-100 flex-shrink-0 bg-gray-50"
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {ex.niche && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#0a0a0a] text-[#f5e6c8]">
                            {ex.niche}
                          </span>
                        )}
                        {typeof ex.views === "number" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#d4a853]/15 text-[#b8860b]">
                            <Eye className="h-3 w-3" /> {ex.views.toLocaleString()} views
                          </span>
                        )}
                        {ex.reelUrl && (
                          <a
                            href={ex.reelUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-[#d4a853]"
                          >
                            <Film className="h-3 w-3" /> reel
                          </a>
                        )}
                      </div>
                      <p className="text-sm text-gray-800">{ex.prompt}</p>
                      {ex.imageDesc && (
                        <p className="text-xs text-gray-400 italic">🧠 sees: {ex.imageDesc}</p>
                      )}
                      {ex.note && <p className="text-xs text-gray-500">📝 {ex.note}</p>}
                    </div>
                    <button
                      onClick={() => remove(ex.id)}
                      title="Delete"
                      className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 h-fit flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ThumbsDown,
  X,
  UserCircle,
  Upload,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const FIXED_NICHES = ["Golf", "Talking", "Omegle", "Podcast", "Dancing", "Motion Control"];
const NICHE_COLORS: Record<string, string> = {
  Golf: "#22c55e",
  Talking: "#3b82f6",
  Omegle: "#a855f7",
  Podcast: "#f59e0b",
  Dancing: "#ec4899",
  "Motion Control": "#14b8a6",
};
const PALETTE = ["#6366f1", "#ef4444", "#0ea5e9", "#f97316", "#8b5cf6", "#10b981", "#eab308", "#db2777"];
function nicheColor(n: string): string {
  if (NICHE_COLORS[n]) return NICHE_COLORS[n];
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Shared login → the person who logged the bad output is picked manually.
const TEAM = ["Andreja", "Nele", "Ignjat", "Kris", "Andrija"];
const AI_SUGGESTIONS = ["Seedance", "Kling", "Runway", "Sora", "Veo", "Hailuo", "Pika", "Higgsfield"];

const emptyForm = {
  aiUsed: "",
  niche: [] as string[],
  issue: "",
  reason: "",
  notes: "",
  addedBy: "",
};

export default function BadOutputsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterNiche, setFilterNiche] = useState("all");
  const [filterAi, setFilterAi] = useState("all");
  const [allAis, setAllAis] = useState<string[]>([]);
  const [nicheOptions, setNicheOptions] = useState<string[]>(FIXED_NICHES);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [addingNiche, setAddingNiche] = useState(false);
  const [customNiche, setCustomNiche] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, niche: filterNiche, ai: filterAi });
      const res = await fetch(`/api/bad-outputs?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      if (Array.isArray(data.allNiches))
        setNicheOptions(Array.from(new Set([...FIXED_NICHES, ...data.allNiches])));
      if (Array.isArray(data.allAis)) setAllAis(data.allAis);
    } catch (e) {
      console.error("Failed to fetch bad outputs:", e);
    } finally {
      setLoading(false);
    }
  }, [search, filterNiche, filterAi]);

  useEffect(() => {
    const t = setTimeout(fetchItems, 300);
    return () => clearTimeout(t);
  }, [fetchItems]);

  const openAdd = () => {
    setEditing(null);
    setFormData({ ...emptyForm });
    setFile(null);
    setFilePreview("");
    setAddingNiche(false);
    setCustomNiche("");
    setUploadPct(0);
    setShowModal(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setFormData({
      aiUsed: item.aiUsed || "",
      niche: Array.isArray(item.niche) ? item.niche : [],
      issue: item.issue || "",
      reason: item.reason || "",
      notes: item.notes || "",
      addedBy: item.addedBy || "",
    });
    setFile(null);
    setFilePreview("");
    setAddingNiche(false);
    setCustomNiche("");
    setShowModal(true);
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    setFile(f);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(URL.createObjectURL(f));
  };

  const toggleNiche = (n: string) =>
    setFormData((p) => ({
      ...p,
      niche: p.niche.includes(n) ? p.niche.filter((x) => x !== n) : [...p.niche, n],
    }));

  const addCustomNiche = () => {
    const n = customNiche.trim();
    if (!n) return;
    setNicheOptions((p) => (p.includes(n) ? p : [...p, n]));
    setFormData((p) => ({ ...p, niche: p.niche.includes(n) ? p.niche : [...p.niche, n] }));
    setCustomNiche("");
    setAddingNiche(false);
  };

  const putWithProgress = (url: string, f: File, onProg: (n: number) => void) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", f.type || "video/mp4");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProg(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error("Upload failed (" + xhr.status + ")"));
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(f);
    });

  const handleSave = async () => {
    if (!editing && !file) {
      alert("Please choose a video file first.");
      return;
    }
    setSaving(true);
    try {
      let videoKey = editing?.videoKey;
      if (file) {
        setUploading(true);
        setUploadPct(0);
        const ct = file.type || "video/mp4";
        const r = await fetch("/api/bad-outputs/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: ct }),
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          alert(e.error || "Uploads aren't available yet.");
          setUploading(false);
          setSaving(false);
          return;
        }
        const { uploadUrl, key } = await r.json();
        await putWithProgress(uploadUrl, file, setUploadPct);
        videoKey = key;
        setUploading(false);
      }
      const payload = { ...formData, ...(editing ? {} : { videoKey }) };
      const res = editing
        ? await fetch(`/api/bad-outputs/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/bad-outputs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e.detail || e.error || "Failed to save");
        return;
      }
      setShowModal(false);
      fetchItems();
    } catch (e: any) {
      alert("Failed to save" + (e?.message ? ": " + e.message : ""));
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/bad-outputs/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteConfirm(null);
        fetchItems();
      }
    } catch {
      alert("Failed to delete");
    }
  };

  const hasFilters = !!search || filterNiche !== "all" || filterAi !== "all";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bad Outputs</h1>
            <p className="text-sm text-gray-500 mt-1">
              Reels that turned out bad — upload the clip and note what went wrong, so the
              team can avoid the same mistakes.
            </p>
          </div>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Bad Output
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search issue, notes, AI..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterAi} onValueChange={setFilterAi}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All AIs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All AIs</SelectItem>
                  {allAis.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterNiche} onValueChange={setFilterNiche}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Niches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Niches</SelectItem>
                  {nicheOptions.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Board */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {[...Array(10)].map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <div className="aspect-[9/16] bg-gray-200 animate-pulse" />
                <CardContent className="p-2.5 space-y-2">
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3" />
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : items.length === 0 ? (
          hasFilters ? (
            <Card>
              <CardContent className="py-16 text-center text-gray-500">
                <ThumbsDown className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                <p>No bad outputs match your filters.</p>
              </CardContent>
            </Card>
          ) : null
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {items.map((item, idx) => (
              <Card
                key={item.id}
                className="group relative overflow-hidden flex flex-col animate-fade-in"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="relative bg-black">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={item.videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full aspect-[9/16] object-contain bg-black"
                  />
                  {item.aiUsed && (
                    <span className="absolute top-2 left-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/70 text-white pointer-events-none">
                      {item.aiUsed}
                    </span>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(item)}
                      className="p-1 rounded-md bg-white/90 backdrop-blur-sm text-gray-600 hover:text-gray-900 shadow-sm"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(item.id)}
                      className="p-1 rounded-md bg-white/90 backdrop-blur-sm text-gray-600 hover:text-red-500 shadow-sm"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <CardContent className="p-2.5 flex flex-col gap-1.5 flex-1">
                  {item.issue && (
                    <p className="flex items-start gap-1 text-xs font-semibold text-red-600">
                      <AlertTriangle className="h-3 w-3 mt-[1px] flex-shrink-0" />
                      <span className="line-clamp-2">{item.issue}</span>
                    </p>
                  )}

                  {item.niche?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      {item.niche.slice(0, 3).map((n: string) => {
                        const c = nicheColor(n);
                        return (
                          <Badge
                            key={n}
                            className="px-1.5 py-0 text-[10px] font-medium"
                            style={{ backgroundColor: `${c}15`, color: c, border: `1px solid ${c}30` }}
                          >
                            {n}
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {item.reason && (
                    <p title={item.reason} className="text-[11px] leading-snug text-gray-500 line-clamp-2">
                      {item.reason}
                    </p>
                  )}

                  <div className="mt-auto pt-1 flex items-center justify-between gap-1 text-[10px] text-gray-400">
                    {item.addedBy ? (
                      <span className="inline-flex items-center gap-0.5 text-gray-600 font-medium truncate">
                        <UserCircle className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{item.addedBy}</span>
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                    <span className="flex-shrink-0">{formatDate(item.createdAt)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      <Dialog open={showModal} onOpenChange={(o) => !uploading && setShowModal(o)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Bad Output" : "Add Bad Output"}</DialogTitle>
            <DialogDescription>
              Upload the reel and note what went wrong, which AI made it, and the niche.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Video upload / preview */}
            {!editing && (
              <div className="space-y-2">
                <Label>Reel video *</Label>
                {filePreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      src={filePreview}
                      controls
                      playsInline
                      className="w-full max-h-[280px] rounded-lg bg-black object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        if (filePreview) URL.revokeObjectURL(filePreview);
                        setFilePreview("");
                      }}
                      className="absolute top-2 right-2 p-1 rounded-md bg-black/60 text-white hover:bg-black/80"
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-[#d4a853] hover:text-[#d4a853] transition-colors"
                  >
                    <Upload className="h-6 w-6" />
                    <span className="text-sm font-medium">Choose a video from your PC</span>
                    <span className="text-[11px] text-gray-400">MP4, MOV, WebM…</span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0] || null)}
                />
                {uploading && (
                  <div className="space-y-1">
                    <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className="h-full bg-[#d4a853] transition-all"
                        style={{ width: `${uploadPct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">Uploading… {uploadPct}%</p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>AI used</Label>
                <Input
                  list="ai-suggestions"
                  placeholder="e.g. Seedance, Kling…"
                  value={formData.aiUsed}
                  onChange={(e) => setFormData({ ...formData, aiUsed: e.target.value })}
                />
                <datalist id="ai-suggestions">
                  {AI_SUGGESTIONS.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label>Added by</Label>
                <Select
                  value={formData.addedBy || "none"}
                  onValueChange={(v) =>
                    setFormData({ ...formData, addedBy: v === "none" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Who logged this?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {TEAM.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Issue (short)</Label>
              <Input
                placeholder="e.g. morphing hands, wrong face, jitter…"
                value={formData.issue}
                onChange={(e) => setFormData({ ...formData, issue: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Why it&apos;s bad</Label>
              <Textarea
                placeholder="Explain what went wrong and why this one didn't work…"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="min-h-[70px]"
              />
            </div>

            {/* Niche */}
            <div className="space-y-2">
              <Label>Niche</Label>
              <div className="flex flex-wrap gap-2">
                {nicheOptions.map((n) => {
                  const active = formData.niche.includes(n);
                  const c = nicheColor(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleNiche(n)}
                      className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                      style={
                        active
                          ? { backgroundColor: c, color: "#fff", borderColor: c }
                          : { backgroundColor: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }
                      }
                    >
                      {n}
                    </button>
                  );
                })}
                {addingNiche ? (
                  <span className="inline-flex items-center gap-1">
                    <Input
                      autoFocus
                      value={customNiche}
                      onChange={(e) => setCustomNiche(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustomNiche();
                        } else if (e.key === "Escape") {
                          setAddingNiche(false);
                          setCustomNiche("");
                        }
                      }}
                      placeholder="New niche"
                      className="h-7 w-32 text-xs"
                    />
                    <button
                      type="button"
                      onClick={addCustomNiche}
                      className="p-1 rounded text-emerald-600 hover:bg-emerald-50"
                      title="Add"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingNiche(true)}
                    className="px-3 py-1 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-[#d4a853] hover:text-[#d4a853] transition-colors inline-flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Specific notes</Label>
              <Textarea
                placeholder="Anything else worth remembering (settings, prompt, seed…)"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="min-h-[60px]"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || (!editing && !file)}>
                {uploading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                  </span>
                ) : saving ? (
                  "Saving..."
                ) : editing ? (
                  "Update"
                ) : (
                  "Add Bad Output"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete bad output</DialogTitle>
            <DialogDescription>
              This removes the entry and its uploaded video. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

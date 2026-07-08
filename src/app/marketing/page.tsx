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
import { formatDate, creatorFromTitle } from "@/lib/utils";
import {
  Search,
  Plus,
  ExternalLink,
  Pencil,
  Trash2,
  Clapperboard,
  AlertTriangle,
  Lightbulb,
  Loader2,
  RefreshCw,
  X,
  UserCircle,
  Folder as FolderIcon,
  FolderPlus,
  FolderInput,
  ChevronRight,
  Home,
  Wand2,
} from "lucide-react";

// ---- Niches (reuse Accounts niches + any custom ones already saved) ----
const FIXED_NICHES = ["Golf", "Talking", "Omegle", "Podcast", "Dancing", "Motion Control"];
const NICHE_COLORS: Record<string, string> = {
  Golf: "#22c55e",
  Talking: "#3b82f6",
  Omegle: "#a855f7",
  Podcast: "#f59e0b",
  Dancing: "#ec4899",
  "Motion Control": "#14b8a6",
};
const PALETTE = [
  "#6366f1", "#ef4444", "#0ea5e9", "#f97316", "#8b5cf6",
  "#10b981", "#eab308", "#db2777", "#0d9488", "#f43f5e",
];
function nicheColor(n: string): string {
  if (NICHE_COLORS[n]) return NICHE_COLORS[n];
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// "Jun 9 / Main account" — the full path of a folder, for unambiguous folder pickers.
function folderPathLabel(f: any, all: any[]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let c: any = f;
  while (c && !seen.has(c.id)) {
    seen.add(c.id);
    parts.unshift(c.name);
    c = all.find((x) => x.id === c.parentId) || null;
  }
  return parts.join(" / ");
}

// ---- Status: In progress (yellow), Done (green), Issue (red). "Issue" flags a
// reel that has a problem worth calling out, with an optional note explaining it.
// Any legacy Idea/Recreating value collapses to "In progress".
const STATUS_META: Record<
  string,
  { label: string; color: string; text: string }
> = {
  RECREATING: { label: "In progress", color: "#eab308", text: "#1f2937" }, // yellow pill, dark text
  DONE: { label: "Done", color: "#16a34a", text: "#ffffff" }, // green pill, white text
  ISSUE: { label: "Issue", color: "#dc2626", text: "#ffffff" }, // red pill, white text
};
const STATUS_ORDER = ["RECREATING", "DONE", "ISSUE"];
// Clicking a card's status pill cycles through the three states in this order.
const STATUS_CYCLE = ["RECREATING", "DONE", "ISSUE"];
// Collapse any stored status to one of the three we display/store.
function statusKey(s: string | null | undefined) {
  if (s === "DONE") return "DONE";
  if (s === "ISSUE") return "ISSUE";
  return "RECREATING";
}

// Team members who can be credited for saving an inspiration (shared login, so
// this is chosen manually rather than derived from the session user).
const TEAM = ["Andreja", "Nele", "Ignjat", "Kris", "Andrija"];

const emptyForm = {
  url: "",
  creator: "",
  title: "",
  thumbnailUrl: "",
  niche: [] as string[],
  status: "RECREATING", // = "In progress"
  modelId: "",
  notes: "",
  issueNote: "",
  addedBy: "",
  folderId: "",
};

function isHttpUrl(v: string) {
  return /^https?:\/\//i.test(v.trim());
}

// Thumbnail that routes through the image proxy and falls back to a placeholder
// (the proxy returns a 1x1 pixel on failure — we detect that via naturalWidth).
function ReelThumb({
  src,
  inspirationId,
  platform,
  className,
}: {
  src?: string | null;
  inspirationId?: string;
  platform?: string | null;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  // Prefer the cached/proxy-backed inspiration thumbnail endpoint; otherwise a directly
  // proxied URL (TikTok/YouTube oembed image, or a manually pasted preview).
  const imgSrc = inspirationId
    ? `/api/inspirations/${inspirationId}/thumb`
    : src
    ? `/api/img-proxy?url=${encodeURIComponent(src)}`
    : null;
  const ok = imgSrc && !errored;
  return (
    <div
      className={
        "relative w-full bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden " +
        (className || "aspect-[4/5]")
      }
    >
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc!}
          alt="reel preview"
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setErrored(true)}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth <= 2 && img.naturalHeight <= 2) setErrored(true);
          }}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
          <Clapperboard className="h-10 w-10" />
          <span className="text-xs font-medium capitalize">
            {platform && platform !== "other" ? platform : "No preview"}
          </span>
        </div>
      )}
    </div>
  );
}

export default function MarketingPage() {
  const [items, setItems] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [nicheOptions, setNicheOptions] = useState<string[]>(FIXED_NICHES);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterNiche, setFilterNiche] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterModel, setFilterModel] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Link preview
  const [previewLoading, setPreviewLoading] = useState(false);
  const lastPreviewedUrl = useRef("");

  // Custom niche entry
  const [addingNiche, setAddingNiche] = useState(false);
  const [customNiche, setCustomNiche] = useState("");

  // Folders
  const [folders, setFolders] = useState<any[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderEditing, setFolderEditing] = useState<any>(null);
  const [folderName, setFolderName] = useState("");
  const [folderDeleteConfirm, setFolderDeleteConfirm] = useState<any>(null);
  const [moveTarget, setMoveTarget] = useState<any>(null); // reel being moved to a folder

  // Seedance prompt generation (per reel) — reuses the async /api/prompter
  const [promptTarget, setPromptTarget] = useState<any>(null);
  const [promptText, setPromptText] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptStatus, setPromptStatus] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const promptJob = useRef<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        niche: filterNiche,
        status: filterStatus,
        modelId: filterModel,
        // While searching, look across every folder; otherwise show the current folder.
        folderId: search.trim() ? "all" : currentFolderId || "root",
      });
      const res = await fetch(`/api/inspirations?${params}`);
      const data = await res.json();
      setItems(data.inspirations || []);
      if (Array.isArray(data.allNiches)) {
        setNicheOptions((prev) =>
          Array.from(new Set([...FIXED_NICHES, ...data.allNiches, ...prev]))
        );
      }
    } catch (error) {
      console.error("Failed to fetch inspirations:", error);
    } finally {
      setLoading(false);
    }
  }, [search, filterNiche, filterStatus, filterModel, currentFolderId]);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      setModels(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch models:", error);
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/folders");
      const data = await res.json();
      setFolders(Array.isArray(data.folders) ? data.folders : []);
    } catch (error) {
      console.error("Failed to fetch folders:", error);
    }
  }, []);

  useEffect(() => {
    fetchModels();
    fetchFolders();
  }, [fetchModels, fetchFolders]);

  useEffect(() => {
    const debounce = setTimeout(() => fetchItems(), 300);
    return () => clearTimeout(debounce);
  }, [fetchItems]);

  // Auto-fetch a preview when the link changes (debounced)
  const runPreview = useCallback(
    async (url: string, force = false) => {
      if (!isHttpUrl(url)) return;
      setPreviewLoading(true);
      try {
        const res = await fetch(
          `/api/inspirations/preview?url=${encodeURIComponent(url.trim())}`
        );
        if (res.ok) {
          const p = await res.json();
          setFormData((prev) => ({
            ...prev,
            thumbnailUrl: force
              ? p.thumbnailUrl || prev.thumbnailUrl
              : prev.thumbnailUrl || p.thumbnailUrl || "",
            creator: force ? p.creator || prev.creator : prev.creator || p.creator || "",
            title: force ? p.title || prev.title : prev.title || p.title || "",
          }));
        }
      } catch {
        /* best-effort */
      } finally {
        setPreviewLoading(false);
        lastPreviewedUrl.current = url.trim();
      }
    },
    []
  );

  useEffect(() => {
    if (!showModal) return;
    const url = formData.url.trim();
    if (!isHttpUrl(url) || url === lastPreviewedUrl.current) return;
    const t = setTimeout(() => runPreview(url), 700);
    return () => clearTimeout(t);
  }, [formData.url, showModal, runPreview]);

  const openAddModal = () => {
    setEditing(null);
    // Default to the first model (Poppy) so every new idea is pre-assigned, and
    // drop the new reel into whatever folder you're currently viewing.
    setFormData({ ...emptyForm, modelId: models[0]?.id || "", folderId: currentFolderId || "" });
    lastPreviewedUrl.current = "";
    setAddingNiche(false);
    setCustomNiche("");
    setShowModal(true);
  };

  const openEditModal = (item: any) => {
    setEditing(item);
    setFormData({
      url: item.url || "",
      creator: item.creator || "",
      title: item.title || "",
      thumbnailUrl: item.thumbnailUrl || "",
      niche: Array.isArray(item.niche) ? item.niche : [],
      status: statusKey(item.status),
      modelId: item.modelId || "",
      notes: item.notes || "",
      issueNote: item.issueNote || "",
      addedBy: item.addedBy || "",
      folderId: item.folderId || "",
    });
    lastPreviewedUrl.current = item.url || "";
    setAddingNiche(false);
    setCustomNiche("");
    setShowModal(true);
  };

  const toggleNiche = (n: string) => {
    setFormData((prev) => ({
      ...prev,
      niche: prev.niche.includes(n)
        ? prev.niche.filter((x) => x !== n)
        : [...prev.niche, n],
    }));
  };

  const addCustomNiche = () => {
    const n = customNiche.trim();
    if (!n) return;
    setNicheOptions((prev) => (prev.includes(n) ? prev : [...prev, n]));
    setFormData((prev) => ({
      ...prev,
      niche: prev.niche.includes(n) ? prev.niche : [...prev.niche, n],
    }));
    setCustomNiche("");
    setAddingNiche(false);
  };

  const handleSave = async () => {
    if (!formData.url.trim()) {
      alert("Please paste a reel link first.");
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/inspirations/${editing.id}` : "/api/inspirations";
      const method = editing ? "PUT" : "POST";
      const payload = {
        ...formData,
        modelId: formData.modelId || null,
        folderId: formData.folderId || null,
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || err.error || "Failed to save");
        return;
      }
      setShowModal(false);
      fetchItems();
    } catch {
      alert("Failed to save inspiration");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/inspirations/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteConfirm(null);
        fetchItems();
      }
    } catch {
      alert("Failed to delete inspiration");
    }
  };

  // Click the status pill to cycle In progress -> Done -> Issue (no editor needed).
  const cycleStatus = async (item: any) => {
    const cur = statusKey(item.status);
    const next =
      STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: next } : i))
    );
    try {
      const res = await fetch(`/api/inspirations/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: item.status } : i))
      );
      alert("Failed to update status — please try again.");
    }
  };

  // ---- Folder navigation + actions ----
  const childFolders = folders
    .filter((f) => (f.parentId || null) === currentFolderId)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const currentFolder = folders.find((f) => f.id === currentFolderId) || null;
  const breadcrumb: any[] = [];
  {
    let c: any = currentFolder;
    const seen = new Set<string>();
    while (c && !seen.has(c.id)) {
      seen.add(c.id);
      breadcrumb.unshift(c);
      c = folders.find((f) => f.id === c.parentId) || null;
    }
  }

  const openAddFolder = () => {
    setFolderEditing(null);
    setFolderName("");
    setShowFolderModal(true);
  };
  const openRenameFolder = (f: any) => {
    setFolderEditing(f);
    setFolderName(f.name);
    setShowFolderModal(true);
  };
  const saveFolder = async () => {
    const name = folderName.trim();
    if (!name) return;
    try {
      const res = folderEditing
        ? await fetch(`/api/folders/${folderEditing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          })
        : await fetch("/api/folders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, parentId: currentFolderId }),
          });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to save folder");
        return;
      }
      setShowFolderModal(false);
      fetchFolders();
    } catch {
      alert("Failed to save folder");
    }
  };
  const handleDeleteFolder = async (f: any) => {
    try {
      const res = await fetch(`/api/folders/${f.id}`, { method: "DELETE" });
      if (res.ok) {
        setFolderDeleteConfirm(null);
        if (currentFolderId === f.id) setCurrentFolderId(f.parentId || null);
        fetchFolders();
        fetchItems();
      }
    } catch {
      alert("Failed to delete folder");
    }
  };
  const moveInspiration = async (inspirationId: string, folderId: string | null) => {
    try {
      const res = await fetch(`/api/inspirations/${inspirationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: folderId || null }),
      });
      if (res.ok) {
        setMoveTarget(null);
        fetchItems();
        fetchFolders();
      }
    } catch {
      alert("Failed to move reel");
    }
  };

  // ---- Seedance prompt per reel (async start → poll, reuses /api/prompter) ----
  const openPrompt = (item: any) => {
    setPromptTarget(item);
    setPromptText(item.prompt || "");
    setPromptError(null);
    setPromptStatus("");
    setPromptLoading(false);
    setPromptCopied(false);
    promptJob.current = null;
  };

  const pollPrompt = async (jobId: string, itemId: string) => {
    if (promptJob.current !== jobId) return;
    try {
      const res = await fetch(`/api/prompter?jobId=${encodeURIComponent(jobId)}`);
      const data = await res.json();
      if (promptJob.current !== jobId) return;
      if (data.status === "done") {
        promptJob.current = null;
        setPromptLoading(false);
        setPromptStatus("");
        setPromptText(data.prompt || "");
        if (data.prompt) {
          fetch(`/api/inspirations/${itemId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: data.prompt }),
          }).catch(() => {});
          setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, prompt: data.prompt } : i)));
        }
      } else if (data.status === "error" || (data.error && data.status !== "pending")) {
        promptJob.current = null;
        setPromptLoading(false);
        setPromptStatus("");
        setPromptError(data.error || "Analysis failed.");
      } else {
        setPromptStatus("Analyzing the reel… ~1–2 min.");
        setTimeout(() => pollPrompt(jobId, itemId), 3000);
      }
    } catch {
      if (promptJob.current === jobId) setTimeout(() => pollPrompt(jobId, itemId), 4000);
    }
  };

  const generatePrompt = async () => {
    if (!promptTarget) return;
    const item = promptTarget;
    setPromptError(null);
    setPromptLoading(true);
    setPromptStatus("Starting…");
    promptJob.current = null;
    try {
      const res = await fetch("/api/prompter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url }),
      });
      const data = await res.json();
      if (!res.ok || !data.job_id) {
        setPromptLoading(false);
        setPromptStatus("");
        setPromptError(data.error || "Couldn't start the analysis.");
        return;
      }
      promptJob.current = data.job_id;
      setPromptStatus("Analyzing the reel… ~1–2 min.");
      pollPrompt(data.job_id, item.id);
    } catch (e: any) {
      setPromptLoading(false);
      setPromptStatus("");
      setPromptError(e?.message || "Couldn't start the analysis.");
    }
  };

  const copyPrompt = () => {
    if (!promptText) return;
    navigator.clipboard.writeText(promptText).then(() => {
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 1500);
    });
  };

  const hasFilters =
    search || filterNiche !== "all" || filterStatus !== "all" || filterModel !== "all";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Marketing</h1>
            <p className="text-sm text-gray-500 mt-1">
              Inspiration board — save reels from other creators to recreate for your models
            </p>
          </div>
          <Button onClick={openAddModal} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Inspiration
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search notes, creator, title..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
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
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterModel} onValueChange={setFilterModel}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Models" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Models</SelectItem>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {models.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Folder navigation (hidden while searching, which shows results across all folders) */}
        {!search.trim() && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-0.5 text-sm text-gray-600 flex-wrap">
                <button
                  onClick={() => setCurrentFolderId(null)}
                  className={
                    "inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-gray-100 " +
                    (currentFolderId === null ? "font-semibold text-gray-900" : "font-medium")
                  }
                >
                  <Home className="h-3.5 w-3.5" /> All
                </button>
                {breadcrumb.map((f) => (
                  <span key={f.id} className="inline-flex items-center gap-0.5">
                    <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                    <button
                      onClick={() => setCurrentFolderId(f.id)}
                      className={
                        "px-2 py-1 rounded-md hover:bg-gray-100 " +
                        (f.id === currentFolderId ? "font-semibold text-gray-900" : "")
                      }
                    >
                      {f.name}
                    </button>
                  </span>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={openAddFolder} className="gap-2">
                <FolderPlus className="h-4 w-4" />
                New folder
              </Button>
            </div>

            {childFolders.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {childFolders.map((f) => (
                  <div
                    key={f.id}
                    onClick={() => setCurrentFolderId(f.id)}
                    className="group relative flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-white hover:border-[#d4a853] hover:shadow-sm cursor-pointer transition"
                  >
                    <FolderIcon className="h-5 w-5 text-[#d4a853] flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{f.name}</p>
                      <p className="text-[11px] text-gray-400">
                        {f._count?.children
                          ? `${f._count.children} folder${f._count.children > 1 ? "s" : ""} · `
                          : ""}
                        {f._count?.inspirations || 0} reel
                        {(f._count?.inspirations || 0) === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openRenameFolder(f);
                        }}
                        className="p-1 rounded bg-white/90 text-gray-500 hover:text-gray-900 shadow-sm"
                        title="Rename"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderDeleteConfirm(f);
                        }}
                        className="p-1 rounded bg-white/90 text-gray-500 hover:text-red-500 shadow-sm"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Board */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <div className="aspect-[4/5] bg-gray-200 animate-pulse" />
                <CardContent className="p-2.5 space-y-2">
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3" />
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-full" />
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-500">
              <Lightbulb className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              {hasFilters ? (
                <p>No inspiration matches your filters.</p>
              ) : (
                <p>
                  No saved inspiration yet. Click{" "}
                  <span className="font-medium text-gray-700">Add Inspiration</span> to
                  save your first reel.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {items.map((item, idx) => {
              const st = STATUS_META[statusKey(item.status)];
              const nextKey =
                STATUS_CYCLE[
                  (STATUS_CYCLE.indexOf(statusKey(item.status)) + 1) %
                    STATUS_CYCLE.length
                ];
              return (
                <Card
                  key={item.id}
                  className="group relative overflow-hidden flex flex-col animate-fade-in"
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  {/* Thumbnail + overlays */}
                  <div className="relative">
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      <ReelThumb inspirationId={item.id} src={item.thumbnailUrl} platform={item.platform} />
                    </a>
                    {/* Status pill — colored by status, click to flip In progress <-> Done */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        cycleStatus(item);
                      }}
                      title={`${st.label} — click to mark ${STATUS_META[nextKey].label}`}
                      style={{ backgroundColor: st.color, color: st.text }}
                      className="absolute top-2 left-2 inline-flex items-center px-2 py-1 rounded-full text-[10px] font-semibold leading-none shadow-sm hover:brightness-105 transition"
                    >
                      {st.label}
                    </button>
                    {/* Hover actions */}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openPrompt(item)}
                        className={
                          "p-1 rounded-md backdrop-blur-sm shadow-sm " +
                          (item.prompt
                            ? "bg-[#d4a853] text-white hover:brightness-105"
                            : "bg-white/90 text-gray-600 hover:text-[#d4a853]")
                        }
                        title={item.prompt ? "Seedance prompt ready" : "Generate Seedance prompt"}
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                      </button>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded-md bg-white/90 backdrop-blur-sm text-gray-600 hover:text-[#d4a853] shadow-sm"
                        title="Open reel"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={() => openEditModal(item)}
                        className="p-1 rounded-md bg-white/90 backdrop-blur-sm text-gray-600 hover:text-gray-900 shadow-sm"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setMoveTarget(item)}
                        className="p-1 rounded-md bg-white/90 backdrop-blur-sm text-gray-600 hover:text-[#d4a853] shadow-sm"
                        title="Move to folder"
                      >
                        <FolderInput className="h-3.5 w-3.5" />
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

                  {/* Body */}
                  <CardContent className="p-2.5 flex flex-col gap-1.5 flex-1">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={item.title || undefined}
                      className="text-xs font-semibold text-gray-900 hover:text-[#d4a853] transition-colors truncate"
                    >
                      {item.creator ||
                        creatorFromTitle(item.title) ||
                        (item.platform && item.platform !== "other"
                          ? `View on ${item.platform[0].toUpperCase()}${item.platform.slice(1)}`
                          : "Open reel")}
                    </a>

                    {/* Niches (max 3 shown) */}
                    {item.niche?.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        {item.niche.slice(0, 3).map((n: string) => {
                          const c = nicheColor(n);
                          return (
                            <Badge
                              key={n}
                              className="px-1.5 py-0 text-[10px] font-medium"
                              style={{
                                backgroundColor: `${c}15`,
                                color: c,
                                border: `1px solid ${c}30`,
                              }}
                            >
                              {n}
                            </Badge>
                          );
                        })}
                        {item.niche.length > 3 && (
                          <span className="text-[10px] text-gray-400">
                            +{item.niche.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Issue note (only shown when the reel is flagged as an issue) */}
                    {statusKey(item.status) === "ISSUE" && item.issueNote && (
                      <div className="flex items-start gap-1 text-[11px] leading-snug text-red-600">
                        <AlertTriangle className="h-3 w-3 mt-[1px] flex-shrink-0" />
                        <span title={item.issueNote} className="line-clamp-2">
                          {item.issueNote}
                        </span>
                      </div>
                    )}

                    {/* Notes (compact — full text on hover) */}
                    {item.notes && (
                      <p
                        title={item.notes}
                        className="text-[11px] leading-snug text-gray-500 line-clamp-2"
                      >
                        {item.notes}
                      </p>
                    )}

                    {/* Footer: model + date */}
                    <div className="mt-auto pt-1 flex items-center justify-between gap-1 text-[10px] text-gray-400">
                      {item.model ? (
                        <span className="inline-flex items-center gap-0.5 text-gray-600 font-medium truncate">
                          <UserCircle className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{item.model.name}</span>
                        </span>
                      ) : (
                        <span className="text-gray-300">Unassigned</span>
                      )}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {item.addedBy && (
                          <span
                            className="text-gray-500 truncate max-w-[70px]"
                            title={`Added by ${item.addedBy}`}
                          >
                            {item.addedBy}
                          </span>
                        )}
                        <span>{formatDate(item.createdAt)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Inspiration" : "Add Inspiration"}</DialogTitle>
            <DialogDescription>
              Paste a reel link, tag the niche, and note why you want to recreate it.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-5 mt-2">
            {/* Left: live preview */}
            <div className="space-y-2">
              <ReelThumb
                src={formData.thumbnailUrl}
                platform={null}
                className="aspect-[4/5] rounded-lg border border-gray-200"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2"
                disabled={!isHttpUrl(formData.url) || previewLoading}
                onClick={() => runPreview(formData.url, true)}
              >
                {previewLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {previewLoading ? "Fetching..." : "Fetch preview"}
              </Button>
            </div>

            {/* Right: fields */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Reel link *</Label>
                <Input
                  placeholder="https://instagram.com/reel/... or tiktok.com/..."
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                />
                <p className="text-[11px] text-gray-400">
                  We&apos;ll try to grab a thumbnail automatically when you paste a link.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Creator</Label>
                  <Input
                    placeholder="@othercreator"
                    value={formData.creator}
                    onChange={(e) =>
                      setFormData({ ...formData, creator: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(v) => setFormData({ ...formData, status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_ORDER.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_META[s].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.status === "ISSUE" && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-red-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> What&apos;s the issue?
                  </Label>
                  <Textarea
                    placeholder="Describe the problem so the team knows what needs fixing…"
                    value={formData.issueNote}
                    onChange={(e) =>
                      setFormData({ ...formData, issueNote: e.target.value })
                    }
                    className="min-h-[70px] border-red-200 focus-visible:ring-red-300"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Title / caption</Label>
                <Input
                  placeholder="Short label for this reel"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>For which model?</Label>
                <Select
                  value={formData.modelId || "none"}
                  onValueChange={(v) =>
                    setFormData({ ...formData, modelId: v === "none" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not assigned</SelectItem>
                    {models.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    <SelectValue placeholder="Who added this?" />
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

              <div className="space-y-2">
                <Label>Folder</Label>
                <Select
                  value={formData.folderId || "none"}
                  onValueChange={(v) =>
                    setFormData({ ...formData, folderId: v === "none" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No folder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No folder (unfiled)</SelectItem>
                    {folders.map((f: any) => (
                      <SelectItem key={f.id} value={f.id}>
                        {folderPathLabel(f, folders)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Niche multi-select (full width) */}
          <div className="space-y-2 mt-4">
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
                  <button
                    type="button"
                    onClick={() => {
                      setAddingNiche(false);
                      setCustomNiche("");
                    }}
                    className="p-1 rounded text-gray-400 hover:bg-gray-100"
                    title="Cancel"
                  >
                    <X className="h-4 w-4" />
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

          {/* Notes */}
          <div className="space-y-2 mt-4">
            <Label>Why I like it / why we should recreate it</Label>
            <Textarea
              placeholder="What caught your eye? What's the hook? How would we adapt it for our model?"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="min-h-[90px]"
            />
          </div>

          {/* Manual thumbnail fallback */}
          <div className="space-y-2 mt-4">
            <Label className="text-gray-500">Preview image URL (optional)</Label>
            <Input
              placeholder="Paste an image URL if no preview was found"
              value={formData.thumbnailUrl}
              onChange={(e) =>
                setFormData({ ...formData, thumbnailUrl: e.target.value })
              }
            />
          </div>

          <div className="flex justify-end gap-3 pt-5">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.url.trim()}>
              {saving ? "Saving..." : editing ? "Update" : "Add Inspiration"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Inspiration</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this saved reel? This cannot be undone.
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

      {/* Create / rename folder */}
      <Dialog open={showFolderModal} onOpenChange={setShowFolderModal}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{folderEditing ? "Rename folder" : "New folder"}</DialogTitle>
            <DialogDescription>
              {folderEditing
                ? "Give this folder a new name."
                : currentFolder
                ? `This folder will be created inside "${currentFolder.name}".`
                : "This folder will be created at the top level."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <Label>Folder name</Label>
            <Input
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveFolder();
                }
              }}
              placeholder='e.g. "Jun 9" or "Main account"'
            />
          </div>
          <div className="flex justify-end gap-3 pt-5">
            <Button variant="outline" onClick={() => setShowFolderModal(false)}>
              Cancel
            </Button>
            <Button onClick={saveFolder} disabled={!folderName.trim()}>
              {folderEditing ? "Rename" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete folder confirmation */}
      <Dialog open={!!folderDeleteConfirm} onOpenChange={() => setFolderDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete folder</DialogTitle>
            <DialogDescription>
              Delete the folder &quot;{folderDeleteConfirm?.name}&quot;? The reels inside
              won&apos;t be deleted — they&apos;ll move to{" "}
              <span className="font-medium">All</span> (unfiled). Any subfolders are removed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setFolderDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => folderDeleteConfirm && handleDeleteFolder(folderDeleteConfirm)}
            >
              Delete folder
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move a reel into a folder */}
      <Dialog open={!!moveTarget} onOpenChange={() => setMoveTarget(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Move to folder</DialogTitle>
            <DialogDescription>Choose where to file this reel.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[320px] overflow-y-auto -mx-1 px-1 mt-2 space-y-1">
            <button
              onClick={() => moveTarget && moveInspiration(moveTarget.id, null)}
              className={
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-gray-100 " +
                (!moveTarget?.folderId ? "bg-gray-100 font-medium" : "")
              }
            >
              <Home className="h-4 w-4 text-gray-400" /> All (unfiled)
            </button>
            {folders.map((f: any) => (
              <button
                key={f.id}
                onClick={() => moveTarget && moveInspiration(moveTarget.id, f.id)}
                className={
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left hover:bg-gray-100 " +
                  (moveTarget?.folderId === f.id ? "bg-gray-100 font-medium" : "")
                }
              >
                <FolderIcon className="h-4 w-4 text-[#d4a853] flex-shrink-0" />
                <span className="truncate">{folderPathLabel(f, folders)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Seedance prompt for a reel */}
      <Dialog
        open={!!promptTarget}
        onOpenChange={(o) => {
          if (!o) {
            setPromptTarget(null);
            promptJob.current = null;
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Seedance prompt</DialogTitle>
            <DialogDescription>
              Generate a ready-to-use Seedance prompt from this reel
              {promptTarget?.creator ? ` — ${promptTarget.creator}` : ""}.
            </DialogDescription>
          </DialogHeader>

          {promptText ? (
            <div className="space-y-3 mt-2">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 max-h-72 overflow-y-auto">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{promptText}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={copyPrompt}>
                  {promptCopied ? "✓ Copied" : "Copy prompt"}
                </Button>
                <Button size="sm" variant="outline" onClick={generatePrompt} disabled={promptLoading}>
                  {promptLoading ? "Working…" : "Regenerate"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <Button onClick={generatePrompt} disabled={promptLoading} className="gap-2">
                <Wand2 className="h-4 w-4" />
                {promptLoading ? "Generating…" : "Generate Seedance prompt"}
              </Button>
            </div>
          )}

          {promptStatus && <p className="text-xs text-amber-600 mt-3">⏳ {promptStatus}</p>}
          {promptError && <p className="text-sm text-red-600 mt-3">{promptError}</p>}
          <p className="text-[11px] text-gray-400 mt-2">
            Downloads the reel and analyzes it (~1–2 min). If a link can&apos;t download, use the
            Prompter page&apos;s Upload option instead.
          </p>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

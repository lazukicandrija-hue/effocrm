"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber, formatExact } from "@/lib/utils";
import {
  Search,
  Plus,
  ExternalLink,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  GripVertical,
  RefreshCw,
} from "lucide-react";

const NICHE_OPTIONS = ["Golf", "Talking", "Omegle", "Podcast", "Dancing", "Motion Control"];

const NICHE_COLORS: Record<string, string> = {
  Golf: "#22c55e",
  Talking: "#3b82f6",
  Omegle: "#a855f7",
  Podcast: "#f59e0b",
  Dancing: "#ec4899",
  "Motion Control": "#14b8a6",
};

const DECISION_OPTIONS = ["KEEP", "REMOVE", "TESTING"];

const DECISION_VARIANTS: Record<string, "success" | "danger" | "warning"> = {
  KEEP: "success",
  REMOVE: "danger",
  TESTING: "warning",
};

const STATUS_VARIANTS: Record<string, "success" | "warning" | "secondary" | "danger"> = {
  ACTIVE: "success",
  WARNING: "warning",
  PAUSED: "secondary",
  BANNED: "danger",
};

const emptyForm = {
  username: "",
  igUsername: "",
  profileUrl: "https://instagram.com/",
  modelId: "",
  niche: [] as string[],
  decision: "",
  status: "ACTIVE",
  followers: 0,
  hasFacebook: false,
  fbPageLink: "",
  linkInBio: false,
  login: "",
  lastPost: "",
  accountCreatedDate: "",
  notes: "",
};

function toDateInput(v: any): string {
  if (!v) return "";
  return new Date(v).toISOString().slice(0, 10);
}

// Inline date cell: shows a short date ("Jun 3") with a transparent native date
// picker overlaid on top — click anywhere on the cell to open the calendar.
function DateCell({
  value,
  onPick,
}: {
  value: any;
  onPick: (v: string) => void;
}) {
  const display = value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";
  return (
    <div className="relative inline-flex items-center justify-center min-w-[56px] px-2 py-1 rounded-md hover:bg-gray-100 transition-colors">
      <span className={value ? "text-gray-700" : "text-gray-300"}>{display}</span>
      <input
        type="date"
        value={value ? new Date(value).toISOString().slice(0, 10) : ""}
        onChange={(e) => onPick(e.target.value)}
        onClick={(e) => {
          e.stopPropagation();
          const el = e.currentTarget as HTMLInputElement & {
            showPicker?: () => void;
          };
          if (typeof el.showPicker === "function") {
            try {
              el.showPicker();
            } catch {}
          }
        }}
        title="Pick a date"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </div>
  );
}

// Click a Status/Decision badge to open a small dropdown and pick a value inline.
// The menu is portaled to <body> so it's never clipped by the scrolling table.
function InlineEnumCell({
  value,
  options,
  variantOf,
  placeholder = "—",
  onSelect,
}: {
  value: string | null;
  options: { value: string | null; label: string }[];
  variantOf: (v: string) => any;
  placeholder?: string;
  onSelect: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        btnRef.current &&
        !btnRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      )
        setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title="Click to change"
        onClick={(e) => {
          e.stopPropagation();
          if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 4, left: r.left });
          }
          setOpen((o) => !o);
        }}
        className="cursor-pointer rounded-md hover:opacity-80 transition-opacity"
      >
        {value ? (
          <Badge variant={variantOf(value)}>{value}</Badge>
        ) : (
          <span className="text-gray-300 hover:text-gray-500">{placeholder}</span>
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 50 }}
            className="bg-white rounded-lg shadow-lg border border-gray-200 p-1 min-w-[130px]"
          >
            {options.map((opt) => (
              <button
                key={opt.value ?? "__none"}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (opt.value !== value) onSelect(opt.value);
                }}
                className={
                  "flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors " +
                  (opt.value === value ? "bg-gray-50" : "")
                }
              >
                {opt.value ? (
                  <Badge variant={variantOf(opt.value)}>{opt.label}</Badge>
                ) : (
                  <span className="text-xs text-gray-400">{opt.label}</span>
                )}
                {opt.value === value && (
                  <Check className="h-3.5 w-3.5 text-gray-400 ml-auto" />
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

// Click a Notes cell to edit it inline in a small popover (portaled to <body> so
// it's never clipped by the scrolling table). Saves on close if the text changed.
function NotesCell({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [draft, setDraft] = useState(value || "");
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const openEditor = () => {
    setDraft(value || "");
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const left = Math.min(Math.max(8, r.left), window.innerWidth - 292);
      setPos({ top: r.bottom + 4, left });
    }
    setOpen(true);
  };
  const commit = () => {
    setOpen(false);
    if ((value || "") !== draft.trim()) onSave(draft.trim());
  };
  const cancel = () => {
    setOpen(false);
    setDraft(value || "");
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        btnRef.current &&
        !btnRef.current.contains(e.target as Node) &&
        popRef.current &&
        !popRef.current.contains(e.target as Node)
      )
        commit();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  });

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={value || "Add a note"}
        onClick={(e) => {
          e.stopPropagation();
          openEditor();
        }}
        className="text-left w-full max-w-[220px] rounded-md px-2 py-1 hover:bg-gray-100 transition-colors"
      >
        {value ? (
          <span className="block text-xs text-gray-600 line-clamp-2 leading-snug">{value}</span>
        ) : (
          <span className="text-xs text-gray-300">+ note</span>
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 50, width: 280 }}
            className="bg-white rounded-lg shadow-lg border border-gray-200 p-2"
          >
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancel();
                else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
              }}
              placeholder="What to change for the best results on this account…"
              rows={4}
              className="w-full text-sm text-gray-800 border border-gray-200 rounded-md p-2 resize-y focus:outline-none focus:border-[#d4a853] placeholder-gray-400"
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] text-gray-400">⌘/Ctrl+Enter to save</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancel}
                  className="text-xs px-2.5 py-1 rounded-md text-gray-500 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commit}
                  className="text-xs px-2.5 py-1 rounded-md bg-[#d4a853] text-black font-medium hover:bg-[#e0b863]"
                >
                  Save
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState("");
  const [filterModel, setFilterModel] = useState("all");
  const [filterNiche, setFilterNiche] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("position");
  const [sortOrder, setSortOrder] = useState("asc");

  // Drag-and-drop reordering
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        search,
        modelId: filterModel,
        niche: filterNiche,
        status: filterStatus,
        sortBy,
        sortOrder,
      });
      const res = await fetch(`/api/accounts?${params}`);
      const data = await res.json();
      setAccounts(data.accounts || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterModel, filterNiche, filterStatus, sortBy, sortOrder]);

  // Re-fetch the table without the loading skeleton (used while polling after a
  // manual refresh, so the numbers update in place).
  const refreshAccountsQuietly = useCallback(async (): Promise<any[]> => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        search,
        modelId: filterModel,
        niche: filterNiche,
        status: filterStatus,
        sortBy,
        sortOrder,
      });
      const res = await fetch(`/api/accounts?${params}`);
      const data = await res.json();
      setAccounts(data.accounts || []);
      return data.accounts || [];
    } catch {
      return [];
    }
  }, [page, search, filterModel, filterNiche, filterStatus, sortBy, sortOrder]);

  // "Refresh now": ask the VPS scraper for an immediate run, then poll until the
  // data actually updates (the scraper bumps each account's lastSyncedAt).
  const handleRefreshNow = async () => {
    if (refreshing) return;
    const baseline = Math.max(
      0,
      ...accounts.map((a) =>
        a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0
      )
    );
    setRefreshing(true);
    try {
      const res = await fetch("/api/scraper/request-refresh", { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      alert("Couldn't queue a refresh — please try again.");
      setRefreshing(false);
      return;
    }
    const start = Date.now();
    const poll = async () => {
      if (Date.now() - start > 6 * 60 * 1000) {
        setRefreshing(false); // timed out — scrape may still land shortly
        return;
      }
      const accts = await refreshAccountsQuietly();
      const fresh = accts.some(
        (a) => a.lastSyncedAt && new Date(a.lastSyncedAt).getTime() > baseline
      );
      if (fresh) {
        setRefreshing(false);
        return;
      }
      setTimeout(poll, 20000);
    };
    setTimeout(poll, 20000);
  };

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      setModels(data);
    } catch (error) {
      console.error("Failed to fetch models:", error);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    const debounce = setTimeout(() => fetchAccounts(), 300);
    return () => clearTimeout(debounce);
  }, [fetchAccounts]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      // Dates read most naturally oldest→newest; everything else highest-first.
      setSortOrder(
        field === "lastPost" || field === "accountCreatedDate" ? "asc" : "desc"
      );
    }
    setPage(1);
  };

  const manualMode = sortBy === "position";

  const persistOrder = async (ordered: any[]) => {
    try {
      await fetch("/api/accounts/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ordered.map((a) => a.id) }),
      });
    } catch (error) {
      console.error("Failed to persist order:", error);
    }
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const reordered = [...accounts];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setAccounts(reordered);
    setDragIndex(null);
    setOverIndex(null);
    // ensure we stay in manual order, then persist
    if (!manualMode) {
      setSortBy("position");
      setSortOrder("asc");
    }
    persistOrder(reordered);
  };

  const toggleNiche = (n: string) => {
    setFormData((prev) => ({
      ...prev,
      niche: prev.niche.includes(n)
        ? prev.niche.filter((x) => x !== n)
        : [...prev.niche, n],
    }));
  };

  const openAddModal = () => {
    setEditingAccount(null);
    setFormData({ ...emptyForm, modelId: models[0]?.id || "" });
    setShowModal(true);
  };

  const openEditModal = (account: any) => {
    setEditingAccount(account);
    setFormData({
      username: account.username || "",
      igUsername: account.igUsername || "",
      profileUrl: account.profileUrl || "",
      modelId: account.modelId || "",
      niche: Array.isArray(account.niche) ? account.niche : [],
      decision: account.decision || "",
      status: account.status || "ACTIVE",
      followers: account.followers || 0,
      hasFacebook: !!account.hasFacebook,
      fbPageLink: account.fbPageLink || "",
      linkInBio: !!account.linkInBio,
      login: account.login || "",
      lastPost: toDateInput(account.lastPost),
      accountCreatedDate: toDateInput(account.accountCreatedDate),
      notes: account.notes || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = editingAccount
        ? `/api/accounts/${editingAccount.id}`
        : "/api/accounts";
      const method = editingAccount ? "PUT" : "POST";

      const payload = {
        ...formData,
        decision: formData.decision || null,
        lastPost: formData.lastPost || null,
        accountCreatedDate: formData.accountCreatedDate || null,
        // A bare "https://instagram.com/" with no handle = no custom URL.
        profileUrl: /^https?:\/\/(www\.)?instagram\.com\/?$/i.test(formData.profileUrl.trim())
          ? ""
          : formData.profileUrl.trim(),
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to save");
        return;
      }

      setShowModal(false);
      fetchAccounts();
    } catch (error) {
      alert("Failed to save account");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteConfirm(null);
        fetchAccounts();
      }
    } catch (error) {
      alert("Failed to delete account");
    }
  };

  // Inline toggle for boolean flags (FB / Bio Link) — click the cell directly
  // instead of opening the editor. Optimistic update, reverts if the save fails.
  const toggleAccountFlag = async (
    account: any,
    field: "hasFacebook" | "linkInBio"
  ) => {
    const newValue = !account[field];
    setAccounts((prev) =>
      prev.map((a) => (a.id === account.id ? { ...a, [field]: newValue } : a))
    );
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: newValue }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, [field]: !newValue } : a))
      );
      alert("Failed to update — please try again.");
    }
  };

  // Inline date picker for lastPost / accountCreatedDate. value is "yyyy-mm-dd" or ""
  const setAccountDate = async (
    account: any,
    field: "lastPost" | "accountCreatedDate",
    value: string
  ) => {
    const newVal = value || null;
    const prevVal = account[field];
    setAccounts((prev) =>
      prev.map((a) => (a.id === account.id ? { ...a, [field]: newVal } : a))
    );
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: newVal }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, [field]: prevVal } : a))
      );
      alert("Failed to update date — please try again.");
    }
  };

  // Inline enum picker for status / decision (value may be null to clear).
  const setAccountField = async (
    account: any,
    field: "status" | "decision",
    value: string | null
  ) => {
    const prevVal = account[field];
    setAccounts((prev) =>
      prev.map((a) => (a.id === account.id ? { ...a, [field]: value } : a))
    );
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, [field]: prevVal } : a))
      );
      alert("Failed to update — please try again.");
    }
  };

  // Inline notes editor — save a per-account note (what to change for best results).
  const setAccountNotes = async (account: any, value: string) => {
    const prevVal = account.notes;
    setAccounts((prev) =>
      prev.map((a) => (a.id === account.id ? { ...a, notes: value } : a))
    );
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, notes: prevVal } : a))
      );
      alert("Failed to save note — please try again.");
    }
  };

  const SortableHead = ({
    label,
    field,
    align = "left",
    className = "",
  }: {
    label: string;
    field: string;
    align?: "left" | "center" | "right";
    className?: string;
  }) => {
    const active = sortBy === field;
    return (
      <TableHead
        className={`cursor-pointer select-none hover:text-gray-700 transition-colors ${className}`}
        onClick={() => handleSort(field)}
      >
        <div
          className={
            "flex items-center gap-1 " +
            (align === "center" ? "justify-center" : align === "right" ? "justify-end" : "")
          }
        >
          {label}
          {active ? (
            sortOrder === "asc" ? (
              <ArrowUp className="h-3 w-3 text-[#d4a853]" />
            ) : (
              <ArrowDown className="h-3 w-3 text-[#d4a853]" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-40" />
          )}
        </div>
      </TableHead>
    );
  };

  const NicheBadges = ({ niches }: { niches: string[] }) => (
    <div className="flex flex-wrap gap-1">
      {(niches || []).length === 0 ? (
        <span className="text-gray-300">—</span>
      ) : (
        niches.map((n) => {
          const c = NICHE_COLORS[n] || "#6b7280";
          return (
            <Badge
              key={n}
              style={{ backgroundColor: `${c}15`, color: c, border: `1px solid ${c}30` }}
            >
              {n}
            </Badge>
          );
        })
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
            <p className="text-sm text-gray-500 mt-1">
              {total} Instagram account{total !== 1 ? "s" : ""} managed
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleRefreshNow}
              disabled={refreshing}
              className="gap-2"
              title="Trigger an immediate scrape on the VPS — numbers update in ~2–4 min"
            >
              <RefreshCw className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")} />
              {refreshing ? "Refreshing…" : "Refresh now"}
            </Button>
            <Button onClick={openAddModal} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Account
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by username..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>
              <Select
                value={filterModel}
                onValueChange={(v) => {
                  setFilterModel(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Models" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Models</SelectItem>
                  {models.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filterNiche}
                onValueChange={(v) => {
                  setFilterNiche(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Niches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Niches</SelectItem>
                  {NICHE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filterStatus}
                onValueChange={(v) => {
                  setFilterStatus(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="WARNING">Warning</SelectItem>
                  <SelectItem value="PAUSED">Paused</SelectItem>
                  <SelectItem value="BANNED">Banned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead className="w-8"></TableHead>
                  <SortableHead label="Username" field="username" />
                  <TableHead>Niche</TableHead>
                  <SortableHead label="Decision" field="decision" />
                  <SortableHead label="Status" field="status" />
                  <SortableHead label="Followers" field="followers" />
                  <SortableHead label="Views Today" field="viewsToday" />
                  <SortableHead label="Total Views" field="totalViews" />
                  <SortableHead label="Last Post" field="lastPost" />
                  <SortableHead label="Acc. Created" field="accountCreatedDate" />
                  <TableHead>Notes</TableHead>
                  <SortableHead label="FB" field="hasFacebook" align="center" className="text-center" />
                  <SortableHead label="Bio Link" field="linkInBio" align="center" className="text-center" />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(14)].map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-gray-200 rounded animate-pulse w-16" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-12 text-gray-500">
                      No accounts found. Add your first account to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((account, index) => (
                    <TableRow
                      key={account.id}
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (overIndex !== index) setOverIndex(index);
                      }}
                      onDrop={() => handleDrop(index)}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setOverIndex(null);
                      }}
                      className={
                        (dragIndex === index ? "opacity-50 " : "") +
                        (overIndex === index && dragIndex !== index
                          ? "border-t-2 border-[#d4a853] "
                          : "")
                      }
                    >
                      <TableCell className="w-8 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
                        <GripVertical className="h-4 w-4" />
                      </TableCell>
                      <TableCell>
                        <a
                          href={account.profileUrl || `https://instagram.com/${account.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-[#d4a853] transition-colors"
                        >
                          @{account.username}
                          <ExternalLink className="h-3 w-3 opacity-50" />
                        </a>
                      </TableCell>
                      <TableCell>
                        <NicheBadges niches={account.niche} />
                      </TableCell>
                      <TableCell>
                        <InlineEnumCell
                          value={account.decision}
                          variantOf={(v) => DECISION_VARIANTS[v]}
                          options={[
                            { value: "KEEP", label: "KEEP" },
                            { value: "TESTING", label: "TESTING" },
                            { value: "REMOVE", label: "REMOVE" },
                            { value: null, label: "Clear" },
                          ]}
                          onSelect={(v) => setAccountField(account, "decision", v)}
                        />
                      </TableCell>
                      <TableCell>
                        <InlineEnumCell
                          value={account.status}
                          variantOf={(v) => STATUS_VARIANTS[v]}
                          options={[
                            { value: "ACTIVE", label: "ACTIVE" },
                            { value: "WARNING", label: "WARNING" },
                            { value: "PAUSED", label: "PAUSED" },
                            { value: "BANNED", label: "BANNED" },
                          ]}
                          onSelect={(v) => setAccountField(account, "status", v)}
                        />
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {formatExact(account.followers)}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="font-medium">{formatNumber(account.viewsToday)}</span>
                          {account.instaViewsToday > 0 && (
                            <span className="text-[10px] text-gray-400 ml-1">
                              (IG: {formatNumber(account.instaViewsToday)})
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatNumber(account.totalViews)}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        <DateCell
                          value={account.lastPost}
                          onPick={(v) => setAccountDate(account, "lastPost", v)}
                        />
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        <DateCell
                          value={account.accountCreatedDate}
                          onPick={(v) => setAccountDate(account, "accountCreatedDate", v)}
                        />
                      </TableCell>
                      <TableCell>
                        <NotesCell
                          value={account.notes}
                          onSave={(v) => setAccountNotes(account, v)}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAccountFlag(account, "hasFacebook");
                          }}
                          title={account.hasFacebook ? "Facebook: on — click to turn off" : "Facebook: off — click to turn on"}
                          className="p-1.5 rounded-md hover:bg-gray-100 transition-colors inline-flex items-center justify-center cursor-pointer"
                        >
                          {account.hasFacebook ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <span className="text-gray-300 leading-none">—</span>
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAccountFlag(account, "linkInBio");
                          }}
                          title={account.linkInBio ? "Bio link: on — click to turn off" : "Bio link: off — click to turn on"}
                          className="p-1.5 rounded-md hover:bg-gray-100 transition-colors inline-flex items-center justify-center cursor-pointer"
                        >
                          {account.linkInBio ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <span className="text-gray-300 leading-none">—</span>
                          )}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(account)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(account.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-gray-600">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? "Edit Account" : "Add New Account"}
            </DialogTitle>
            <DialogDescription>
              {editingAccount
                ? "Update the Instagram account details."
                : "Add a new Instagram account to track."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Username *</Label>
                <Input
                  placeholder="username (without @)"
                  value={formData.username}
                  onChange={(e) => {
                    const u = e.target.value;
                    const handle = u.replace(/^@/, "").trim();
                    setFormData((prev) => {
                      const prevHandle = prev.username.replace(/^@/, "").trim();
                      // Auto-build the Profile URL from the username — unless it was
                      // manually customized to something other than the IG default.
                      const wasAuto =
                        !prev.profileUrl ||
                        prev.profileUrl === "https://instagram.com/" ||
                        prev.profileUrl === `https://instagram.com/${prevHandle}`;
                      return {
                        ...prev,
                        username: u,
                        profileUrl: wasAuto
                          ? handle
                            ? `https://instagram.com/${handle}`
                            : "https://instagram.com/"
                          : prev.profileUrl,
                      };
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>IG Username (for scraping)</Label>
                <Input
                  placeholder="defaults to username"
                  value={formData.igUsername}
                  onChange={(e) =>
                    setFormData({ ...formData, igUsername: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Profile URL</Label>
              <Input
                placeholder="https://instagram.com/..."
                value={formData.profileUrl}
                onChange={(e) =>
                  setFormData({ ...formData, profileUrl: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Niche (multi-select)</Label>
              <div className="flex flex-wrap gap-2">
                {NICHE_OPTIONS.map((n) => {
                  const active = formData.niche.includes(n);
                  const c = NICHE_COLORS[n];
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
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Decision</Label>
                <Select
                  value={formData.decision || "none"}
                  onValueChange={(v) =>
                    setFormData({ ...formData, decision: v === "none" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {DECISION_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Select
                  value={formData.modelId}
                  onValueChange={(v) => setFormData({ ...formData, modelId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Poppy (default)" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="WARNING">Warning</SelectItem>
                    <SelectItem value="PAUSED">Paused</SelectItem>
                    <SelectItem value="BANNED">Banned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Followers</Label>
                <Input
                  type="number"
                  value={formData.followers}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      followers: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Last Post</Label>
                <Input
                  type="date"
                  value={formData.lastPost}
                  onChange={(e) =>
                    setFormData({ ...formData, lastPost: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Account Created</Label>
                <Input
                  type="date"
                  value={formData.accountCreatedDate}
                  onChange={(e) =>
                    setFormData({ ...formData, accountCreatedDate: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={formData.hasFacebook}
                  onChange={(e) =>
                    setFormData({ ...formData, hasFacebook: e.target.checked })
                  }
                />
                Facebook
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={formData.linkInBio}
                  onChange={(e) =>
                    setFormData({ ...formData, linkInBio: e.target.checked })
                  }
                />
                Link in bio
              </label>
            </div>

            <div className="space-y-2">
              <Label>FB Page Link</Label>
              <Input
                placeholder="https://facebook.com/..."
                value={formData.fbPageLink}
                onChange={(e) =>
                  setFormData({ ...formData, fbPageLink: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Login (credentials)</Label>
              <Input
                placeholder="email:password:phone"
                value={formData.login}
                onChange={(e) =>
                  setFormData({ ...formData, login: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Any notes about this account..."
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingAccount ? "Update" : "Add Account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this account? This will also delete all
              associated daily stats. This action cannot be undone.
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

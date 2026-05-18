"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatNumber, daysBetween, formatDate } from "@/lib/utils";
import {
  Search,
  Plus,
  ExternalLink,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";

const NICHE_LABELS: Record<string, string> = {
  GOLF: "Golf",
  CASUAL: "Casual",
  TALKING_HEAD: "Talking Head",
  DANCING: "Dancing",
};

const STATUS_VARIANTS: Record<string, "success" | "warning" | "secondary" | "danger"> = {
  ACTIVE: "success",
  WARNING: "warning",
  PAUSED: "secondary",
  BANNED: "danger",
};

const NICHE_VARIANTS: Record<string, "golf" | "casual" | "talking_head" | "dancing"> = {
  GOLF: "golf",
  CASUAL: "casual",
  TALKING_HEAD: "talking_head",
  DANCING: "dancing",
};

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
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [formData, setFormData] = useState({
    username: "",
    modelId: "",
    niche: "GOLF",
    status: "ACTIVE",
    followers: 0,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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
      setSortOrder("desc");
    }
  };

  const openAddModal = () => {
    setEditingAccount(null);
    setFormData({
      username: "",
      modelId: models[0]?.id || "",
      niche: "GOLF",
      status: "ACTIVE",
      followers: 0,
      notes: "",
    });
    setShowModal(true);
  };

  const openEditModal = (account: any) => {
    setEditingAccount(account);
    setFormData({
      username: account.username,
      modelId: account.modelId,
      niche: account.niche,
      status: account.status,
      followers: account.followers,
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

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
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

  const SortableHead = ({ label, field }: { label: string; field: string }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-gray-700 transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </div>
    </TableHead>
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
          <Button onClick={openAddModal} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Account
          </Button>
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
                  {Object.entries(NICHE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
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
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <SortableHead label="Username" field="username" />
                  <TableHead>Model</TableHead>
                  <TableHead>Niche</TableHead>
                  <TableHead>Status</TableHead>
                  <SortableHead label="Followers" field="followers" />
                  <TableHead>Views Today</TableHead>
                  <TableHead>Total Views</TableHead>
                  <TableHead>Days Active</TableHead>
                  <SortableHead label="Created" field="dateCreated" />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(10)].map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-gray-200 rounded animate-pulse w-16" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-gray-500">
                      No accounts found. Add your first account to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <a
                          href={`https://instagram.com/${account.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-[#d4a853] transition-colors"
                        >
                          @{account.username}
                          <ExternalLink className="h-3 w-3 opacity-50" />
                        </a>
                      </TableCell>
                      <TableCell className="text-sm">
                        {account.model?.name || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={NICHE_VARIANTS[account.niche]}>
                          {NICHE_LABELS[account.niche] || account.niche}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[account.status]}>
                          {account.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatNumber(account.followers)}
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
                      <TableCell className="text-sm text-gray-500">
                        {daysBetween(account.dateCreated)}d
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {formatDate(account.dateCreated)}
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
        <DialogContent>
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
            <div className="space-y-2">
              <Label>Username *</Label>
              <Input
                placeholder="username (without @)"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Model *</Label>
                <Select
                  value={formData.modelId}
                  onValueChange={(v) =>
                    setFormData({ ...formData, modelId: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select model" />
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
              <div className="space-y-2">
                <Label>Niche *</Label>
                <Select
                  value={formData.niche}
                  onValueChange={(v) =>
                    setFormData({ ...formData, niche: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(NICHE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
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
                  onValueChange={(v) =>
                    setFormData({ ...formData, status: v })
                  }
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
      <Dialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
      >
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

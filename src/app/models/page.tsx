"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatNumber } from "@/lib/utils";
import { Plus, UserCircle, Camera, Eye, Trash2 } from "lucide-react";

export default function ModelsPage() {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      setModels(data);
    } catch (error) {
      console.error("Failed to fetch models:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setShowModal(false);
        setName("");
        fetchModels();
      }
    } catch {
      alert("Failed to add model");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/models/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteConfirm(null);
        fetchModels();
      }
    } catch {
      alert("Failed to delete model");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Models</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage your OnlyFans models and view their performance
            </p>
          </div>
          <Button onClick={() => setShowModal(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Model
          </Button>
        </div>

        {/* Models grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-16 w-16 rounded-full bg-gray-200" />
                    <div className="h-5 bg-gray-200 rounded w-1/2" />
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : models.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-500">
              <UserCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No models yet. Add your first model to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {models.map((model, idx) => (
              <Card
                key={model.id}
                className="animate-fade-in group relative overflow-hidden"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                {/* Delete button */}
                <button
                  onClick={() => setDeleteConfirm(model.id)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all z-10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                <CardContent className="p-6">
                  {/* Avatar */}
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#d4a853] to-[#f5e6c8] flex items-center justify-center mb-4 shadow-lg">
                    <span className="text-2xl font-serif text-[#0a0a0a] font-bold">
                      {model.name.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {model.name}
                  </h3>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Camera className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-xs text-gray-500">
                          Total Accounts
                        </span>
                      </div>
                      <p className="text-lg font-bold text-gray-900">
                        {model.totalAccounts}
                      </p>
                      <p className="text-xs text-emerald-600">
                        {model.activeAccounts} active
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Eye className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-xs text-gray-500">
                          Total Views
                        </span>
                      </div>
                      <p className="text-lg font-bold text-gray-900">
                        {formatNumber(model.totalViews)}
                      </p>
                      <div className="flex gap-2 text-[10px]">
                        <span className="text-[#E1306C]">
                          IG: {formatNumber(model.totalInstaViews)}
                        </span>
                        <span className="text-[#1877F2]">
                          FB: {formatNumber(model.totalFbViews)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Model Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Model</DialogTitle>
            <DialogDescription>
              Add a new model to assign Instagram accounts to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Model Name *</Label>
              <Input
                placeholder="e.g. Poppy"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={saving || !name.trim()}>
                {saving ? "Adding..." : "Add Model"}
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
            <DialogTitle>Delete Model</DialogTitle>
            <DialogDescription>
              Are you sure? This will delete the model and ALL associated
              accounts and their stats. This cannot be undone.
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
              Delete Model
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

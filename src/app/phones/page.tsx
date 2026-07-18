"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Smartphone, Plus, Trash2, X, Loader2, Check, Pencil } from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#22c55e",
  WARNING: "#f59e0b",
  PAUSED: "#6b7280",
  BANNED: "#ef4444",
};

type Acct = { id: string; username: string; igUsername: string | null; status: string; niche: string[] };
type Phone = { id: string; name: string; notes: string | null; accounts: Acct[] };

export default function PhonesPage() {
  const [phones, setPhones] = useState<Phone[]>([]);
  const [unassigned, setUnassigned] = useState<Acct[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/phones");
      const d = await res.json();
      setPhones(Array.isArray(d.phones) ? d.phones : []);
      setUnassigned(Array.isArray(d.unassigned) ? d.unassigned : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addPhone = async () => {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/phones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        alert((await res.json()).error || "Couldn't add phone");
        return;
      }
      setNewName("");
      fetchData();
    } finally {
      setAdding(false);
    }
  };

  const renamePhone = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    setEditing(null);
    await fetch(`/api/phones/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    fetchData();
  };

  const deletePhone = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? Its accounts stay in the CRM — they just won't be on a phone.`)) return;
    await fetch(`/api/phones/${id}`, { method: "DELETE" });
    fetchData();
  };

  const setAccountPhone = async (accountId: string, phoneId: string | null) => {
    await fetch(`/api/accounts/${accountId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneId: phoneId ?? "" }),
    });
    fetchData();
  };

  const AccountRow = ({ a, onRemove }: { a: Acct; onRemove: () => void }) => (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-gray-50 hover:bg-gray-100 group">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: STATUS_COLOR[a.status] || "#9ca3af" }}
          title={a.status}
        />
        <span className="text-sm text-gray-800 truncate">@{a.igUsername || a.username}</span>
      </div>
      <button
        onClick={onRemove}
        title="Remove from this phone"
        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Smartphone className="h-6 w-6 text-[#d4a853]" />
              Phones
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Track which Instagram accounts live on which iPhone.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="New phone name (e.g. iPhone 13 — black)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPhone()}
              className="w-[260px] bg-white"
            />
            <Button onClick={addPhone} disabled={adding || !newName.trim()} className="gap-2">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add phone
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            {phones.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center text-gray-500">
                  <Smartphone className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">No phones yet. Add your first iPhone above.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {phones.map((p) => (
                  <Card key={p.id} className="flex flex-col">
                    <CardContent className="p-4 flex flex-col gap-3 flex-1">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        {editing === p.id ? (
                          <div className="flex items-center gap-1 flex-1">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && renamePhone(p.id)}
                              autoFocus
                              className="h-8"
                            />
                            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => renamePhone(p.id)}>
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <Smartphone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <h3 className="font-semibold text-gray-900 truncate">{p.name}</h3>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {p.accounts.length}/5
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            onClick={() => {
                              setEditing(p.id);
                              setEditName(p.name);
                            }}
                            className="p-1 text-gray-300 hover:text-gray-600"
                            title="Rename"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deletePhone(p.id, p.name)}
                            className="p-1 text-gray-300 hover:text-red-500"
                            title="Delete phone"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Accounts */}
                      <div className="space-y-1 flex-1">
                        {p.accounts.length === 0 ? (
                          <p className="text-xs text-gray-400 py-2">No accounts on this phone yet.</p>
                        ) : (
                          p.accounts.map((a) => (
                            <AccountRow key={a.id} a={a} onRemove={() => setAccountPhone(a.id, null)} />
                          ))
                        )}
                      </div>

                      {/* Assign an unassigned account */}
                      {unassigned.length > 0 && (
                        <Select value="" onValueChange={(v) => v && setAccountPhone(v, p.id)}>
                          <SelectTrigger className="h-9 bg-white text-sm">
                            <SelectValue placeholder="+ Add an account…" />
                          </SelectTrigger>
                          <SelectContent>
                            {unassigned.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                @{a.igUsername || a.username}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Unassigned */}
            {unassigned.length > 0 && (
              <Card className="border-dashed">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    Not on a phone yet ({unassigned.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {unassigned.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-sm text-gray-700"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: STATUS_COLOR[a.status] || "#9ca3af" }}
                        />
                        @{a.igUsername || a.username}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Use the “+ Add an account” picker on a phone above to assign these.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

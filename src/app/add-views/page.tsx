"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eye, Upload, CheckCircle, AlertCircle, Camera } from "lucide-react";

export default function AddViewsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Single entry form
  const [selectedAccount, setSelectedAccount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [instaViews, setInstaViews] = useState("");
  const [fbViews, setFbViews] = useState("");
  const [followers, setFollowers] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  // Bulk entry
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState<any[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);

  // Tab
  const [tab, setTab] = useState<"single" | "bulk">("single");

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts?limit=500");
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Single entry submit
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const res = await fetch("/api/stats/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccount,
          date,
          instaViews: parseInt(instaViews) || 0,
          fbViews: parseInt(fbViews) || 0,
          followers: parseInt(followers) || 0,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to save");
        return;
      }

      const accountName = accounts.find((a) => a.id === selectedAccount)?.username;
      setSuccess(`Views saved for @${accountName}`);
      setInstaViews("");
      setFbViews("");
      setFollowers("");

      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Failed to save stats");
    } finally {
      setSaving(false);
    }
  };

  // Parse bulk CSV
  const parseBulk = () => {
    const lines = bulkText
      .trim()
      .split("\n")
      .filter((line) => line.trim());

    const parsed = lines.map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      return {
        username: parts[0]?.replace("@", "") || "",
        instaViews: parseInt(parts[1]) || 0,
        fbViews: parseInt(parts[2]) || 0,
        followers: parseInt(parts[3]) || 0,
        valid: !!parts[0] && accounts.some((a) => a.username === parts[0]?.replace("@", "")),
      };
    });

    setBulkPreview(parsed);
  };

  // Submit bulk
  const handleBulkSubmit = async () => {
    setBulkSaving(true);
    setBulkResult(null);

    try {
      const entries = bulkPreview
        .filter((e) => e.valid)
        .map((e) => ({
          username: e.username,
          instaViews: e.instaViews,
          fbViews: e.fbViews,
          followers: e.followers,
          date,
        }));

      const res = await fetch("/api/stats/daily", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });

      const result = await res.json();
      setBulkResult(result);
      setBulkText("");
      setBulkPreview([]);
    } catch {
      setBulkResult({ error: "Failed to process bulk stats" });
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add Views</h1>
          <p className="text-sm text-gray-500 mt-1">
            Record daily Instagram & Facebook reel views for your accounts
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-white rounded-lg border border-gray-200 p-1 w-fit">
          <button
            onClick={() => setTab("single")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${
              tab === "single"
                ? "bg-[#0a0a0a] text-[#f5e6c8]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Eye className="h-4 w-4" />
            Single Entry
          </button>
          <button
            onClick={() => setTab("bulk")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${
              tab === "bulk"
                ? "bg-[#0a0a0a] text-[#f5e6c8]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Upload className="h-4 w-4" />
            Bulk Entry
          </button>
        </div>

        {tab === "single" ? (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="text-base">Quick Entry</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSingleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Account *</Label>
                    <Select
                      value={selectedAccount}
                      onValueChange={setSelectedAccount}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            @{account.username} ({account.model?.name})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Camera className="h-4 w-4 text-[#E1306C]" />
                      Instagram Views
                    </Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={instaViews}
                      onChange={(e) => setInstaViews(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-[#1877F2]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      Facebook Views
                    </Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={fbViews}
                      onChange={(e) => setFbViews(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Followers</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={followers}
                      onChange={(e) => setFollowers(e.target.value)}
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 border border-red-200">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 text-sm rounded-lg px-4 py-3 border border-emerald-200">
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    {success}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={saving || !selectedAccount}
                  className="w-full sm:w-auto"
                >
                  {saving ? "Saving..." : "Save Views"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="text-base">Bulk Entry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Date for all entries</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-fit"
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Paste CSV data (format: username,instaViews,fbViews,followers)
                </Label>
                <Textarea
                  placeholder={`poppy.golf,15000,8000,120\npoppy.casual,22000,12000,250\npoppy.dance,8000,0,80`}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  className="min-h-[120px] font-mono text-sm"
                />
              </div>

              <Button
                variant="outline"
                onClick={parseBulk}
                disabled={!bulkText.trim()}
              >
                Parse & Preview
              </Button>

              {/* Preview table */}
              {bulkPreview.length > 0 && (
                <div className="space-y-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Username</TableHead>
                        <TableHead>IG Views</TableHead>
                        <TableHead>FB Views</TableHead>
                        <TableHead>Followers</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bulkPreview.map((entry, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">
                            @{entry.username}
                          </TableCell>
                          <TableCell>{entry.instaViews.toLocaleString()}</TableCell>
                          <TableCell>{entry.fbViews.toLocaleString()}</TableCell>
                          <TableCell>{entry.followers.toLocaleString()}</TableCell>
                          <TableCell>
                            {entry.valid ? (
                              <Badge variant="success">Found</Badge>
                            ) : (
                              <Badge variant="danger">Not Found</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      {bulkPreview.filter((e) => e.valid).length} of{" "}
                      {bulkPreview.length} entries valid
                    </p>
                    <Button
                      onClick={handleBulkSubmit}
                      disabled={
                        bulkSaving ||
                        bulkPreview.filter((e) => e.valid).length === 0
                      }
                    >
                      {bulkSaving ? "Saving..." : "Confirm & Save All"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Bulk result */}
              {bulkResult && (
                <div
                  className={`rounded-lg px-4 py-3 text-sm border ${
                    bulkResult.error
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}
                >
                  {bulkResult.error ? (
                    bulkResult.error
                  ) : (
                    <>
                      ✅ {bulkResult.success} entries saved successfully
                      {bulkResult.failed > 0 && (
                        <>, ❌ {bulkResult.failed} failed</>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

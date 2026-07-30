"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Images, Upload, Copy, Link2, Trash2, Check, Loader2 } from "lucide-react";

const FIXED_NICHES = ["Golf", "Talking", "Omegle", "Podcast", "Dancing", "Motion Control"];

type RefImg = {
  id: string;
  niche: string;
  label: string | null;
  url: string | null;
  createdAt: string;
};

export default function ReferenceImagesPage() {
  const [items, setItems] = useState<RefImg[]>([]);
  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState("all");
  const [uploadNiche, setUploadNiche] = useState(FIXED_NICHES[0]);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null); // "img:<id>" | "link:<id>"

  const fetchItems = useCallback(async () => {
    try {
      const r = await fetch("/api/reference-images");
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
  }, [fetchItems]);

  const folders = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach((i) => (counts[i.niche] = (counts[i.niche] || 0) + 1));
    return Object.keys(counts).sort();
  }, [items]);

  const upload = useCallback(async (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    const niche = uploadNiche.trim() || "Uncategorized";
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const r = await fetch("/api/reference-images/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "upload URL failed");
        const put = await fetch(d.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!put.ok) throw new Error("upload failed");
        await fetch("/api/reference-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageKey: d.key, niche }),
        });
      }
      await fetchItems();
      setFolder(niche);
    } catch (e: any) {
      alert(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [uploadNiche, fetchItems]);

  // Paste an image straight from the clipboard (⌘/Ctrl+V) → uploads to the current folder.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const imgs: File[] = [];
      for (const it of Array.from(e.clipboardData?.items || [])) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) imgs.push(f);
        }
      }
      if (imgs.length) {
        e.preventDefault();
        upload(imgs);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [upload]);

  const copyImage = async (img: RefImg) => {
    if (!img.url) return;
    try {
      const blob = await (await fetch(img.url)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error();
      ctx.drawImage(bitmap, 0, 0);
      const png: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error())), "image/png")
      );
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setCopied("img:" + img.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      alert("Couldn't copy the image — try Copy link instead (paste that into Airtable).");
    }
  };

  const copyLink = async (img: RefImg) => {
    if (!img.url) return;
    try {
      await navigator.clipboard.writeText(img.url);
      setCopied("link:" + img.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      alert("Couldn't copy the link.");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this reference image?")) return;
    setItems((xs) => xs.filter((i) => i.id !== id));
    try {
      await fetch(`/api/reference-images/${id}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
  };

  const shown = folder === "all" ? items : items.filter((i) => i.niche === folder);
  const nicheOptions = Array.from(new Set([...FIXED_NICHES, ...folders]));

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Images className="h-6 w-6" /> Reference Images
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Your reusable starting images for image-to-video, sorted into niche folders. Copy one
            straight into Airtable&apos;s image field — no re-making it each time.
          </p>
        </div>

        {/* Upload */}
        <Card>
          <CardContent className="p-5 flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label>Folder (niche)</Label>
              <input
                list="ref-folders"
                value={uploadNiche}
                onChange={(e) => setUploadNiche(e.target.value)}
                placeholder="e.g. Golf"
                className="h-9 w-48 rounded-md border border-gray-200 px-3 text-sm bg-white"
              />
              <datalist id="ref-folders">
                {nicheOptions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <label
              className={`inline-flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium text-white cursor-pointer ${
                uploading ? "opacity-60 pointer-events-none" : ""
              }`}
              style={{ backgroundColor: "#0a0a0a" }}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading…" : "Upload images"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="text-xs text-gray-400">
              Adds to the folder above — or just <b className="font-semibold text-gray-500">paste an image</b> (⌘V / Ctrl+V). Uploads several at once.
            </span>
          </CardContent>
        </Card>

        {/* Folder tabs */}
        {folders.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {[["all", `All ${items.length}`] as const, ...folders.map((f) => [f, `${f} ${items.filter((i) => i.niche === f).length}`] as const)].map(
              ([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFolder(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    folder === key ? "bg-[#0a0a0a] text-[#f5e6c8] border-[#0a0a0a]" : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              )
            )}
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-gray-400">
            No reference images yet — pick a folder above and upload some.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {shown.map((img) => (
              <Card key={img.id} className="overflow-hidden flex flex-col group">
                <div className="relative bg-gray-100 aspect-[3/4]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {img.url && <img src={img.url} alt={img.label || img.niche} className="w-full h-full object-cover" />}
                  <button
                    onClick={() => remove(img.id)}
                    title="Delete"
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/55 text-[#f5e6c8]">
                    {img.niche}
                  </span>
                </div>
                <CardContent className="p-2 flex gap-1.5">
                  <button
                    onClick={() => copyImage(img)}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold text-white"
                    style={{ backgroundColor: "#d4a853" }}
                  >
                    {copied === "img:" + img.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied === "img:" + img.id ? "Copied" : "Copy image"}
                  </button>
                  <button
                    onClick={() => copyLink(img)}
                    title="Copy a link to paste into Airtable"
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    {copied === "link:" + img.id ? <Check className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

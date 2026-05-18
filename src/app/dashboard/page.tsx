"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatNumber, calcDelta } from "@/lib/utils";
import {
  Camera,
  Eye,
  TrendingUp,
  TrendingDown,
  Users,
  Plus,
  Ban,
  Activity,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DashboardStats {
  totalAccounts: number;
  activeAccounts: number;
  warningAccounts: number;
  pausedAccounts: number;
  bannedAccounts: number;
  viewsToday: number;
  viewsYesterday: number;
  viewsDelta: number;
  viewsThisWeek: number;
  viewsThisMonth: number;
  followersToday: number;
  followersDelta: number;
  accountsAddedToday: number;
  viewsByNiche: any[];
  viewsOverTime: any[];
  statusDistribution: any[];
}

const NICHE_COLORS: Record<string, string> = {
  GOLF: "#22c55e",
  CASUAL: "#3b82f6",
  TALKING_HEAD: "#a855f7",
  DANCING: "#ec4899",
};

const NICHE_LABELS: Record<string, string> = {
  GOLF: "Golf",
  CASUAL: "Casual",
  TALKING_HEAD: "Talking Head",
  DANCING: "Dancing",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("today");
  const [modelId, setModelId] = useState("all");
  const [models, setModels] = useState<any[]>([]);

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams({ period, modelId });
      const res = await fetch(`/api/stats?${params}`);
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
    }
  }, [period, modelId]);

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
    setLoading(true);
    fetchStats();
  }, [fetchStats]);

  const StatCard = ({
    title,
    value,
    delta,
    icon: Icon,
    color,
    delay,
  }: {
    title: string;
    value: number | string;
    delta?: number;
    icon: any;
    color: string;
    delay: string;
  }) => (
    <Card className={`animate-fade-in ${delay}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {title}
            </p>
            <p className="text-2xl font-bold mt-1" style={{ color }}>
              {typeof value === "number" ? formatNumber(value) : value}
            </p>
            {delta !== undefined && (
              <div className="flex items-center gap-1 mt-1">
                {delta >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span
                  className={`text-xs font-medium ${
                    delta >= 0 ? "text-emerald-500" : "text-red-500"
                  }`}
                >
                  {delta >= 0 ? "+" : ""}
                  {formatNumber(delta)} vs yesterday
                </span>
              </div>
            )}
          </div>
          <div
            className="p-2.5 rounded-xl"
            style={{ backgroundColor: `${color}10` }}
          >
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Overview of your Instagram accounts performance
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Period filter */}
            <div className="flex bg-white rounded-lg border border-gray-200 p-1">
              {["today", "week", "month"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    period === p
                      ? "bg-[#0a0a0a] text-[#f5e6c8]"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {p === "today" ? "Today" : p === "week" ? "This Week" : "This Month"}
                </button>
              ))}
            </div>

            {/* Model filter */}
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger className="w-[160px] bg-white">
                <SelectValue placeholder="All Models" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                {models.map((model: any) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            {[...Array(7)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="animate-pulse space-y-3">
                    <div className="h-3 bg-gray-200 rounded w-2/3" />
                    <div className="h-7 bg-gray-200 rounded w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : stats ? (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
              <StatCard
                title="Active Accounts"
                value={stats.activeAccounts}
                icon={Camera}
                color="#22c55e"
                delay=""
              />
              <StatCard
                title="Views Today"
                value={stats.viewsToday}
                delta={stats.viewsDelta}
                icon={Eye}
                color="#d4a853"
                delay="animate-delay-100"
              />
              <StatCard
                title="Views This Week"
                value={stats.viewsThisWeek}
                icon={Activity}
                color="#3b82f6"
                delay="animate-delay-200"
              />
              <StatCard
                title="Views This Month"
                value={stats.viewsThisMonth}
                icon={TrendingUp}
                color="#a855f7"
                delay="animate-delay-300"
              />
              <StatCard
                title="Followers Today"
                value={stats.followersToday}
                delta={stats.followersDelta}
                icon={Users}
                color="#06b6d4"
                delay="animate-delay-400"
              />
              <StatCard
                title="Added Today"
                value={stats.accountsAddedToday}
                icon={Plus}
                color="#d4a853"
                delay="animate-delay-500"
              />
              <StatCard
                title="Banned"
                value={stats.bannedAccounts}
                icon={Ban}
                color="#ef4444"
                delay="animate-delay-600"
              />
            </div>

            {/* Status Balance Bar */}
            <Card className="animate-fade-in">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                  Account Status Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex rounded-full overflow-hidden h-4 bg-gray-100">
                  {stats.statusDistribution.map((status: any) =>
                    status.value > 0 ? (
                      <div
                        key={status.name}
                        className="h-full transition-all duration-500 ease-out"
                        style={{
                          width: `${(status.value / stats.totalAccounts) * 100}%`,
                          backgroundColor: status.color,
                        }}
                        title={`${status.name}: ${status.value}`}
                      />
                    ) : null
                  )}
                </div>
                <div className="flex gap-6 mt-3">
                  {stats.statusDistribution.map((status: any) => (
                    <div key={status.name} className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: status.color }}
                      />
                      <span className="text-xs text-gray-600">
                        {status.name}: {status.value}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Line Chart - Views over time */}
              <Card className="animate-fade-in lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Views Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={stats.viewsOverTime}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                        tickLine={false}
                        axisLine={{ stroke: "#e5e7eb" }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                        tickLine={false}
                        axisLine={{ stroke: "#e5e7eb" }}
                        tickFormatter={(v) => formatNumber(v)}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid #e5e7eb",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        }}
                        formatter={(value: any) => [formatNumber(Number(value)), ""]}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="instaViews"
                        stroke="#E1306C"
                        strokeWidth={2}
                        dot={false}
                        name="Instagram"
                        activeDot={{ r: 5, stroke: "#E1306C", strokeWidth: 2, fill: "#fff" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="fbViews"
                        stroke="#1877F2"
                        strokeWidth={2}
                        dot={false}
                        name="Facebook"
                        activeDot={{ r: 5, stroke: "#1877F2", strokeWidth: 2, fill: "#fff" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="total"
                        stroke="#d4a853"
                        strokeWidth={2.5}
                        dot={false}
                        name="Total"
                        activeDot={{ r: 5, stroke: "#d4a853", strokeWidth: 2, fill: "#fff" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Bar Chart - Views by niche */}
              <Card className="animate-fade-in">
                <CardHeader>
                  <CardTitle className="text-base">Views by Niche</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={stats.viewsByNiche}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="niche"
                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                        tickLine={false}
                        axisLine={{ stroke: "#e5e7eb" }}
                        tickFormatter={(v) => NICHE_LABELS[v] || v}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                        tickLine={false}
                        axisLine={{ stroke: "#e5e7eb" }}
                        tickFormatter={(v) => formatNumber(v)}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid #e5e7eb",
                        }}
                        formatter={(value: any, name: any) => [
                          formatNumber(Number(value)),
                          name === "instaViews" ? "Instagram" : "Facebook",
                        ]}
                        labelFormatter={(label) => NICHE_LABELS[label] || label}
                      />
                      <Bar dataKey="instaViews" fill="#E1306C" radius={[4, 4, 0, 0]} name="instaViews" />
                      <Bar dataKey="fbViews" fill="#1877F2" radius={[4, 4, 0, 0]} name="fbViews" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Pie Chart - Status distribution */}
              <Card className="animate-fade-in">
                <CardHeader>
                  <CardTitle className="text-base">Account Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={stats.statusDistribution.filter((s: any) => s.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {stats.statusDistribution
                          .filter((s: any) => s.value > 0)
                          .map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid #e5e7eb",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center gap-6 -mt-4">
                    {stats.statusDistribution.map((status: any) => (
                      <div key={status.name} className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: status.color }}
                        />
                        <span className="text-xs text-gray-600">
                          {status.name} ({status.value})
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-gray-500">
            No data available. Add some accounts to get started.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, Label,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, Target, DollarSign, Percent, BarChart3, Users, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

/* ---------- Types ---------- */
interface KPIs { sales2025: number; sales2026: number; target: number; ach: number; growth: number; }
interface MonthlyPoint { month: string; monthNum: number; sales: number; target: number; sales2025: number; }
interface CustomerRow { name: string; area: string; totalSales: number; repName?: string; }
interface RepRow { id: string; name: string; code: string; managerName: string; managerId: string; sales2026: number; sales2025: number; target2026: number; ach: number; remaining: number; growth: number; }
interface ProductPoint { month: string; monthNum: number; focus: number; other: number; }
interface ManagerFilter { id: string; name: string; code: string; reps: { id: string; name: string; code: string }[]; }

interface RawData {
  kpis: KPIs;
  monthlyData: MonthlyPoint[];
  monthlyByRep: Record<string, { month: number; sales: number; target: number; sales2025: number }[]>;
  customerList: { name: string; area: string; totalSales: number; repId: string; repName: string }[];
  repPerformance: RepRow[];
  productSalesRaw: { repId: string; month: number; isFocus: boolean; amount: number }[];
  filters: ManagerFilter[];
}

interface DashboardData { kpis: KPIs; monthlyData: MonthlyPoint[]; topCustomers: CustomerRow[]; repPerformance: RepRow[]; productData: ProductPoint[]; filters: ManagerFilter[]; }

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------- Helpers ---------- */
const fmt = (n: number) => n.toLocaleString("en-US");
const fmtK = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return fmt(n);
};

  /* ---------- Percentage Label for Stacked Bars ---------- */
  const renderPctLabel = (props: any, label: string) => {
    const { x, y, width, height, value, payload } = props;
    const total = (payload?.focus || 0) + (payload?.other || 0);
    if (!height || height < 18 || !total || total === 0) return null;
    const pct = Math.round((value / total) * 100);
    return (
      <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={11}
        fontWeight={600}
      >
        {pct}% {label}
      </text>
    );
  };

/* ---------- Client-side filtering logic ---------- */
function computeDashboard(raw: RawData, managerId: string, repId: string): DashboardData {
  // Filter reps
  let filteredReps = raw.repPerformance;
  if (managerId !== "all") filteredReps = filteredReps.filter(r => r.managerId === managerId);
  if (repId !== "all") filteredReps = filteredReps.filter(r => r.id === repId);
  const repIds = new Set(filteredReps.map(r => r.id));

  // Recompute KPIs
  let totalSales2025 = 0, totalSales2026 = 0, totalTarget2026 = 0;
  for (const rep of filteredReps) {
    totalSales2025 += rep.sales2025;
    totalSales2026 += rep.sales2026;
    totalTarget2026 += rep.target2026;
  }
  const ach = totalTarget2026 > 0 ? ((totalSales2026 / totalTarget2026) * 100) : 0;
  const growth = totalSales2025 > 0 ? (((totalSales2026 - totalSales2025) / totalSales2025) * 100) : 0;

  // Recompute monthly data for filtered reps
  const maxMonth = raw.monthlyData.length;
  const monthlyData: MonthlyPoint[] = [];
  for (let m = 0; m < maxMonth; m++) {
    let sales = 0, target = 0, sales2025 = 0;
    for (const rid of repIds) {
      const rm = raw.monthlyByRep[rid];
      if (rm && rm[m]) {
        sales += rm[m].sales;
        target += rm[m].target;
        sales2025 += rm[m].sales2025;
      }
    }
    monthlyData.push({
      month: MONTH_NAMES[m], monthNum: m + 1,
      sales: Math.round(sales), target: Math.round(target), sales2025: Math.round(sales2025),
    });
  }

  // Top customers filtered by visible reps
  const topCustomers = raw.customerList
    .filter(c => repIds.has(c.repId))
    .sort((a, b) => b.totalSales - a.totalSales)
    .slice(0, 10)
    .map(c => ({ name: c.name, area: c.area, totalSales: c.totalSales, repName: c.repName }));

  // Product data filtered by reps
  const focusByMonth: Record<number, number> = {};
  const otherByMonth: Record<number, number> = {};
  for (const ps of raw.productSalesRaw) {
    if (!repIds.has(ps.repId)) continue;
    if (ps.isFocus) focusByMonth[ps.month] = (focusByMonth[ps.month] || 0) + ps.amount;
    else otherByMonth[ps.month] = (otherByMonth[ps.month] || 0) + ps.amount;
  }
  const productData = monthlyData.map(md => ({
    month: md.month, monthNum: md.monthNum,
    focus: Math.round(focusByMonth[md.monthNum] || 0),
    other: Math.round(otherByMonth[md.monthNum] || 0),
  }));

  return {
    kpis: { sales2025: Math.round(totalSales2025), sales2026: Math.round(totalSales2026), target: Math.round(totalTarget2026), ach: Math.round(ach * 10) / 10, growth: Math.round(growth * 10) / 10 },
    monthlyData, topCustomers, repPerformance: filteredReps, productData,
    filters: raw.filters,
  };
}

/* ---------- PHARCO Brand Colors ---------- */
const PHARCO_ORANGE = "#fba31d";
const PHARCO_DARK = "#65666b";
const PHARCO_DARKER = "#3d3e41";
const PHARCO_LIGHT = "#fef3e0";

/* ---------- Component ---------- */
const BTN_ACTIVE = "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all bg-[#fba31d] text-white border-[#fba31d] shadow-sm";
const BTN_IDLE = "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all bg-white text-gray-600 border-gray-200 hover:border-[#fba31d] hover:bg-[#fef3e0]";

export default function DashboardPage() {
  const [rawData, setRawData] = useState<RawData | null>(null);
  const [loading, setLoading] = useState(true);
  const [managerId, setManagerId] = useState<string>("all");
  const [repId, setRepId] = useState<string>("all");
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set());

  // Fetch raw data once
  useEffect(() => {
    fetch('/api-data.json')
      .then(res => res.json())
      .then(json => { setRawData(json); setLoading(false); })
      .catch(e => { console.error(e); setLoading(false); });
  }, []);

  // Compute dashboard from raw data + filters
  const data = useMemo(() => {
    if (!rawData) return null;
    return computeDashboard(rawData, managerId, repId);
  }, [rawData, managerId, repId]);

  const repsForManager = useMemo(() => {
    if (!rawData || managerId === "all") return [];
    const m = rawData.filters.find(f => f.id === managerId);
    return m?.reps || [];
  }, [rawData, managerId]);

  const handleManagerChange = (val: string) => {
    setManagerId(val);
    setRepId("all");
  };

  /* Month selection logic */
  const allMonths = useMemo(() => data?.monthlyData || [], [data]);

  const handleMonthClick = useCallback((monthNum: number, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedMonths(prev => {
        const next = new Set(prev);
        if (next.has(monthNum)) next.delete(monthNum);
        else next.add(monthNum);
        return next.size === 0 ? new Set() : next;
      });
    } else {
      setSelectedMonths(prev => {
        if (prev.size === 1 && prev.has(monthNum)) return new Set();
        return new Set([monthNum]);
      });
    }
  }, []);

  const selectQuarter = useCallback((q: number) => {
    const qMonths: Record<number, number[]> = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7] };
    setSelectedMonths(new Set(qMonths[q] || []));
  }, []);

  const clearSelection = useCallback(() => setSelectedMonths(new Set()), []);

  /* Computed KPIs based on selected months */
  const computedKPIs = useMemo((): KPIs => {
    if (!data) return { sales2025: 0, sales2026: 0, target: 0, ach: 0, growth: 0 };
    if (selectedMonths.size === 0) return data.kpis;

    const filtered = data.monthlyData.filter(d => selectedMonths.has(d.monthNum));
    const s2025 = filtered.reduce((s, d) => s + d.sales2025, 0);
    const s2026 = filtered.reduce((s, d) => s + d.sales, 0);
    const tgt = filtered.reduce((s, d) => s + d.target, 0);
    return {
      sales2025: Math.round(s2025),
      sales2026: Math.round(s2026),
      target: Math.round(tgt),
      ach: Math.round((tgt > 0 ? (s2026 / tgt) * 100 : 0) * 10) / 10,
      growth: Math.round((s2025 > 0 ? ((s2026 - s2025) / s2025) * 100 : 0) * 10) / 10,
    };
  }, [data, selectedMonths]);

  const selectionLabel = useMemo(() => {
    if (selectedMonths.size === 0) return "YTD";
    if (selectedMonths.size === 1) {
      return allMonths.find(m => m.monthNum === [...selectedMonths][0])?.month || "";
    }
    const sorted = [...selectedMonths].sort();
    if (JSON.stringify(sorted) === JSON.stringify([1, 2, 3])) return "Q1";
    if (JSON.stringify(sorted) === JSON.stringify([4, 5, 6])) return "Q2";
    if (JSON.stringify(sorted) === JSON.stringify([7])) return "Q3";
    return sorted.map(m => allMonths.find(d => d.monthNum === m)?.month).join(" + ");
  }, [selectedMonths, allMonths]);

  /* ---- KPI Card ---- */
  function KPICard({ title, value, icon: Icon, subtitle, color }: {
    title: string; value: string; icon: React.ElementType; subtitle?: string; color: string;
  }) {
    return (
      <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow border-t-2 border-t-[#fba31d]">
        <div className={`absolute top-0 right-0 w-20 h-20 rounded-bl-full opacity-10 ${color}`} />
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</span>
            <div className={`p-2 rounded-lg ${color}`}>
              <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold tracking-tight">{value}</div>
          {subtitle && (
            <div className="flex items-center mt-1 text-xs">{subtitle}</div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="max-w-[1600px] mx-auto space-y-6">
          <Skeleton className="h-16 w-full max-w-md" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-80" /><Skeleton className="h-80" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const kpis = computedKPIs;
  const { topCustomers, repPerformance, productData, filters, monthlyData } = data;

  const CUSTOMER_COLORS = [
    "#fba31d", "#65666b", "#3d3e41", "#e8941a", "#8b8d92",
    "#d4a04a", "#525358", "#c48a12", "#9ca0a5", "#b8941f",
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-[#fef3e0]/20">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#3d3e41] to-[#65666b] text-white shadow-lg">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-4">
              <img src="/pharco-logo.png" alt="PHARCO Logo" className="h-10 sm:h-12 lg:h-14 w-auto object-contain bg-white rounded-lg px-2 py-1" />
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">PHARCO CHC</h1>
                <p className="text-[#fba31d] text-sm sm:text-base mt-1 font-medium">Sales Performance | Jan - Jul 2026 (YTD)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-[#fba31d]/20 text-[#fba31d] border-[#fba31d]/30 text-xs">
                <Users className="h-3 w-3 ml-1" />
                {repPerformance.length} Reps
              </Badge>
              <Badge variant="secondary" className="bg-[#fba31d]/20 text-[#fba31d] border-[#fba31d]/30 text-xs">
                <BarChart3 className="h-3 w-3 ml-1" />
                {filters.length} Managers
              </Badge>
              <Badge variant="secondary" className="bg-white/10 text-white/80 border-white/20 text-xs">
                54K Pharmacies
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Filters */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">District Manager</label>
                <Select value={managerId} onValueChange={handleManagerChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {filters.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Medical Rep</label>
                <Select value={repId} onValueChange={setRepId}>
                  <SelectTrigger className="w-full" disabled={managerId === "all"}>
                    <SelectValue placeholder={managerId === "all" ? "Select a manager first" : "All"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {repsForManager.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name} ({r.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Month Selector */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground ml-1">Period:</span>
                <button onClick={clearSelection} className={selectedMonths.size === 0 ? BTN_ACTIVE : BTN_IDLE}>
                  YTD
                </button>
                <button onClick={() => selectQuarter(1)} className={selectedMonths.size === 3 && [1,2,3].every(m => selectedMonths.has(m)) ? BTN_ACTIVE : BTN_IDLE}>Q1</button>
                <button onClick={() => selectQuarter(2)} className={selectedMonths.size === 3 && [4,5,6].every(m => selectedMonths.has(m)) ? BTN_ACTIVE : BTN_IDLE}>Q2</button>
                <button onClick={() => selectQuarter(3)} className={selectedMonths.size === 1 && selectedMonths.has(7) ? BTN_ACTIVE : BTN_IDLE}>Q3</button>
                <span className="text-gray-300 mx-1">|</span>
                {allMonths.map(m => (
                  <button
                    key={m.monthNum}
                    onClick={(e) => handleMonthClick(m.monthNum, e)}
                    className={selectedMonths.has(m.monthNum) ? BTN_ACTIVE : BTN_IDLE}
                  >
                    {m.month}
                  </button>
                ))}
              </div>
              {selectedMonths.size > 0 && (
                <button onClick={clearSelection} className="text-xs text-[#fba31d] hover:text-[#3d3e41] font-medium underline underline-offset-2">
                  Clear
                </button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Click to select a month &middot; <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px] font-mono">Ctrl</kbd>+Click to combine months
            </p>
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KPICard title={selectedMonths.size === 0 ? "Sales 2025" : `Sales 2025 (${selectionLabel})`} value={fmtK(kpis.sales2025)} icon={DollarSign} color="bg-[#65666b]" />
          <KPICard title={selectedMonths.size === 0 ? "Sales 2026" : `Sales 2026 (${selectionLabel})`} value={fmtK(kpis.sales2026)} icon={BarChart3} color="bg-[#fba31d]" subtitle={
            <span className={kpis.growth >= 0 ? "text-[#059669]" : "text-red-600"}>
              {kpis.growth >= 0 ? <ArrowUpRight className="inline h-3 w-3" /> : <ArrowDownRight className="inline h-3 w-3" />}
              {" "}{Math.abs(kpis.growth)}% vs 2025
            </span>
          } />
          <KPICard title={selectedMonths.size === 0 ? "Target" : `Target (${selectionLabel})`} value={fmtK(kpis.target)} icon={Target} color="bg-[#65666b]" />
          <KPICard title="ACH %" value={`${kpis.ach}%`} icon={Percent} color={kpis.ach >= 100 ? "bg-[#059669]" : "bg-[#fba31d]"}
            subtitle={kpis.ach >= 100 ? <span className="text-[#059669]">Achieved</span> : <span className="text-[#fba31d]">Remaining {fmtK(kpis.target - kpis.sales2026)}</span>}
          />
          <KPICard title="Growth %" value={`${kpis.growth}%`} icon={kpis.growth >= 0 ? TrendingUp : TrendingDown} color={kpis.growth >= 0 ? "bg-[#059669]" : "bg-red-600"}
            subtitle={
              <span className={kpis.growth >= 0 ? "text-[#059669]" : "text-red-600"}>
                {kpis.growth >= 0 ? "Positive Growth" : "Decline"}
              </span>
            }
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Sales vs Target */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold">Monthly Sales vs Target - 2026</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[300px] sm:h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} />
                    <Tooltip formatter={(value: number) => fmt(value)} />
                    <Legend />
                    <Bar dataKey="sales" name="Sales" fill="#fba31d" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="target" name="Target" fill="#65666b" radius={[4, 4, 0, 0]} opacity={0.6} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Top 10 Customers */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold">Top 10 Customers (Pharmacies)</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[350px] sm:h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topCustomers} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={220} />
                    <Tooltip formatter={(value: number, _name: string, props: any) => [fmt(value), props.payload.repName ? `${props.payload.area} | ${props.payload.repName}` : props.payload.area]} />
                    <Bar dataKey="totalSales" name="Total Sales" radius={[0, 4, 4, 0]}>
                      {topCustomers.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CUSTOMER_COLORS[index % CUSTOMER_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Product Chart */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold">Focus Products vs Other Products - 2026</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[280px] sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} />
                  <Tooltip formatter={(value: number) => fmt(value)} />
                  <Legend />
                  <Bar dataKey="focus" name="Focus Products" fill="#fba31d" radius={[4, 4, 0, 0]} stackId="a" label={{ content: (props: any) => renderPctLabel(props, 'Focus'), dataKey: 'focus' }} />
                  <Bar dataKey="other" name="Other Products" fill="#65666b" radius={[4, 4, 0, 0]} stackId="a" opacity={0.7} label={{ content: (props: any) => renderPctLabel(props, 'Other'), dataKey: 'other' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Rep Performance Table */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold">Rep Performance</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#fef3e0]/50 hover:bg-[#fef3e0]/50">
                    <TableHead className="font-bold text-xs">Medical Rep</TableHead>
                    <TableHead className="font-bold text-xs">Code</TableHead>
                    <TableHead className="font-bold text-xs">District Manager</TableHead>
                    <TableHead className="font-bold text-xs text-center">Target</TableHead>
                    <TableHead className="font-bold text-xs text-center">Sales</TableHead>
                    <TableHead className="font-bold text-xs text-center">ACH %</TableHead>
                    <TableHead className="font-bold text-xs text-center">Remaining</TableHead>
                    <TableHead className="font-bold text-xs text-center">Growth %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repPerformance.map((rep) => (
                    <TableRow key={rep.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <TableCell className="font-medium text-sm">{rep.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{rep.code}</TableCell>
                      <TableCell className="text-xs">{rep.managerName}</TableCell>
                      <TableCell className="text-center text-sm font-mono">{fmt(rep.target2026)}</TableCell>
                      <TableCell className="text-center text-sm font-mono font-semibold">{fmt(rep.sales2026)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={rep.ach >= 100 ? "default" : "secondary"}
                          className={rep.ach >= 100 ? "bg-[#fef3e0] text-[#3d3e41] hover:bg-[#fef3e0] border border-[#fba31d]/30" : "bg-red-50 text-red-700 hover:bg-red-50 border border-red-200"}>
                          {rep.ach}%
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-center text-sm font-mono ${rep.remaining > 0 ? "text-red-500" : "text-[#059669]"}`}>
                        {rep.remaining > 0 ? fmt(rep.remaining) : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${rep.growth >= 0 ? "text-[#059669]" : "text-red-500"}`}>
                          {rep.growth >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          {Math.abs(rep.growth)}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t bg-white/60 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-xs text-muted-foreground">
          PHARCO CHC Sales Performance Dashboard &copy; 2026
        </div>
      </footer>
    </div>
  );
}
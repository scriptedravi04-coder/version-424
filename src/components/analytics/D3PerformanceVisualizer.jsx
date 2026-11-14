// v330: Indian digit grouping (en-IN) for counts, matching the rest of the app.
import React, { useState, useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { TrendingUp, Eye, Users, Heart, RefreshCw } from "lucide-react";

export default function D3PerformanceVisualizer({ entityId = "demo_deal_1", title = "Performance & Growth Velocity" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false); // v332: a failed load showed an empty chart with no message
  const [activeMetric, setActiveMetric] = useState("views"); // 'views' | 'reach' | 'likes' | 'engagement'
  const [activeTab, setActiveTab] = useState("velocity"); // 'velocity' | 'funnel' | 'geo'
  const [daysFilter, setDaysFilter] = useState(14); // 7 or 14

  const svgRef = useRef(null);
  const tooltipRef = useRef(null);

  // Fetch or reload performance data from backend
  const fetchData = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/market-intelligence/performance/${encodeURIComponent(entityId)}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else if (!data) {
        setFailed(true);
      }
    } catch (err) {
      console.warn("Failed to load performance metrics:", err);
      if (!data) setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [entityId]);

  // Filter time-series by selected day window
  const activeSeries = useMemo(() => {
    if (!data?.time_series) return [];
    if (daysFilter === 7) {
      return data.time_series.slice(-7);
    }
    return data.time_series;
  }, [data, daysFilter]);

  // D3 Chart Drawing Logic
  useEffect(() => {
    if (!svgRef.current || !activeSeries.length || activeTab !== "velocity") return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // clear previous render

    const width = 760;
    const height = 320;
    const margin = { top: 25, right: 30, bottom: 40, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add SVG defs for smooth gradient fill
    const defs = svg.append("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", "area-gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    const metricColors = {
      views: { primary: "#6366f1", stop: "#6366f1" },
      reach: { primary: "#8b5cf6", stop: "#8b5cf6" },
      likes: { primary: "#ec4899", stop: "#ec4899" },
      engagement: { primary: "#10b981", stop: "#10b981" },
    };

    const curColor = metricColors[activeMetric] || metricColors.views;

    gradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", curColor.stop)
      .attr("stop-opacity", 0.45);

    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", curColor.stop)
      .attr("stop-opacity", 0.02);

    // Value accessor depending on selected metric
    const getMetricVal = (d) => {
      if (activeMetric === "views") return d.cumulative_views;
      if (activeMetric === "reach") return d.cumulative_reach;
      if (activeMetric === "likes") return d.cumulative_likes;
      if (activeMetric === "engagement") return d.engagement_rate;
      return d.cumulative_views;
    };

    // Scales
    const xScale = d3
      .scalePoint()
      .domain(activeSeries.map((d) => d.day_label))
      .range([0, innerWidth]);

    const yMax = d3.max(activeSeries, (d) => getMetricVal(d)) * 1.15 || 100;
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([innerHeight, 0]);

    // Grid lines (horizontal)
    const yAxisGrid = d3
      .axisLeft(yScale)
      .tickSize(-innerWidth)
      .tickFormat("")
      .ticks(5);

    g.append("g")
      .attr("class", "grid-lines opacity-10")
      .call(yAxisGrid)
      .selectAll("line")
      .attr("stroke", "currentColor");

    // X Axis
    const xAxis = d3.axisBottom(xScale);
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis)
      .attr("class", "text-[11px] text-[var(--text-secondary)] font-medium")
      .selectAll("text")
      .attr("dy", "1em");

    // Y Axis
    const formatY = (d) => {
      if (activeMetric === "engagement") return `${d}%`;
      if (d >= 1000000) return `${(d / 1000000).toFixed(1)}M`;
      if (d >= 1000) return `${(d / 1000).toFixed(0)}k`;
      return d;
    };

    const yAxis = d3.axisLeft(yScale).ticks(5).tickFormat(formatY);
    g.append("g")
      .call(yAxis)
      .attr("class", "text-[11px] text-[var(--text-secondary)] font-medium");

    // Category Benchmark dashed line (if viewing views)
    // v332: only when the server sent benchmark numbers (else the line was drawn from NaN)
    if (activeMetric === "views" && activeSeries.every((d) => Number.isFinite(Number(d.category_benchmark_views)))) {
      const benchmarkLine = d3
        .line()
        .x((d) => xScale(d.day_label))
        .y((d) => yScale(d.category_benchmark_views))
        .curve(d3.curveMonotoneX);

      g.append("path")
        .datum(activeSeries)
        .attr("fill", "none")
        .attr("stroke", "#94a3b8")
        .attr("stroke-dasharray", "4,4")
        .attr("stroke-width", 1.5)
        .attr("d", benchmarkLine)
        .attr("opacity", 0.7);
    }

    // Area generator
    const area = d3
      .area()
      .x((d) => xScale(d.day_label))
      .y0(innerHeight)
      .y1((d) => yScale(getMetricVal(d)))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(activeSeries)
      .attr("fill", "url(#area-gradient)")
      .attr("d", area);

    // Main line generator
    const line = d3
      .line()
      .x((d) => xScale(d.day_label))
      .y((d) => yScale(getMetricVal(d)))
      .curve(d3.curveMonotoneX);

    const path = g
      .append("path")
      .datum(activeSeries)
      .attr("fill", "none")
      .attr("stroke", curColor.primary)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("d", line);

    // Path animation
    const totalLength = path.node()?.getTotalLength() || 1000;
    path
      .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
      .attr("stroke-dashoffset", totalLength)
      .transition()
      .duration(900)
      .ease(d3.easeCubicOut)
      .attr("stroke-dashoffset", 0);

    // Interactive Hover Elements (vertical guide line & dynamic dot)
    const focusLine = g
      .append("line")
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .style("opacity", 0);

    const focusCircle = g
      .append("circle")
      .attr("r", 5)
      .attr("fill", curColor.primary)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2.5)
      .style("opacity", 0);

    // Overlay rect to capture all mouse events smoothly
    g.append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mousemove", (event) => {
        const [xm] = d3.pointer(event);
        // Find closest point
        const domain = xScale.domain();
        const range = domain.map((d) => xScale(d));
        let closestIdx = 0;
        let minDiff = Infinity;
        range.forEach((val, idx) => {
          const diff = Math.abs(xm - val);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = idx;
          }
        });

        const d = activeSeries[closestIdx];
        if (!d) return;

        const xPos = xScale(d.day_label);
        const yPos = yScale(getMetricVal(d));

        focusLine.attr("x1", xPos).attr("x2", xPos).style("opacity", 1);
        focusCircle.attr("cx", xPos).attr("cy", yPos).style("opacity", 1);

        if (tooltipRef.current) {
          const rect = svgRef.current.getBoundingClientRect();
          const metricLabel =
            activeMetric === "views"
              ? "Cumulative Views"
              : activeMetric === "reach"
              ? "Unique Reach"
              : activeMetric === "likes"
              ? "Total Likes"
              : "Engagement Rate";

          const valFormatted =
            activeMetric === "engagement"
              ? `${d.engagement_rate}%`
              : Number(getMetricVal(d)).toLocaleString("en-IN");

          tooltipRef.current.style.opacity = "1";
          tooltipRef.current.style.left = `${rect.left + margin.left + xPos - 60}px`;
          tooltipRef.current.style.top = `${rect.top + margin.top + yPos - 55}px`;
          tooltipRef.current.innerHTML = `
            <div class="text-[11px] font-bold text-white">${d.date} (${d.day_label})</div>
            <div class="text-xs font-black text-indigo-200">${metricLabel}: ${valFormatted}</div>
          `;
        }
      })
      .on("mouseleave", () => {
        focusLine.style("opacity", 0);
        focusCircle.style("opacity", 0);
        if (tooltipRef.current) {
          tooltipRef.current.style.opacity = "0";
        }
      });
  }, [activeSeries, activeMetric, activeTab]);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border-default)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#7C3AED]/10 text-[#7C3AED]">
              <TrendingUp size={18} />
            </span>
            <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
            {/* v332: removed the "D3.js Live Telemetry" badge — tech jargon, not something users need */}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Interactive growth trajectories, audience funnel retention, and geographic metro breakdown.
          </p>
        </div>

        {/* View mode tabs */}
        <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] p-1 rounded-xl border border-[var(--border-default)] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("velocity")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "velocity"
                ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Velocity Chart
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("funnel")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "funnel"
                ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Conversion Funnel
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("geo")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "geo"
                ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Metro Split
          </button>
        </div>
      </div>

      {/* KPI Cards Summary */}
      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4">
          <div className="p-3 rounded-xl bg-[var(--bg-elevated)]/60 border border-[var(--border-default)]">
            <div className="flex items-center justify-between text-[var(--text-secondary)] mb-1">
              <span className="text-[11px] font-semibold">Total Verified Views</span>
              <Eye size={14} className="text-[#7C3AED]" />
            </div>
            <div className="text-lg font-black text-[var(--text-primary)]">
              {Number(data.summary.total_views).toLocaleString("en-IN")}
            </div>
            {/* v332: hidden when the server has no benchmark (it read "+undefined%") */}
            {Number.isFinite(Number(data.summary.benchmark_outperformance_pct)) && data.summary.benchmark_outperformance_pct !== null && (
              <div className={`text-[10px] font-semibold mt-0.5 ${Number(data.summary.benchmark_outperformance_pct) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--text-secondary)]"}`}>
                {Number(data.summary.benchmark_outperformance_pct) >= 0 ? "+" : ""}{data.summary.benchmark_outperformance_pct}% vs Category Avg
              </div>
            )}
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-elevated)]/60 border border-[var(--border-default)]">
            <div className="flex items-center justify-between text-[var(--text-secondary)] mb-1">
              <span className="text-[11px] font-semibold">Unique Reach</span>
              <Users size={14} className="text-[#7C3AED]" />
            </div>
            <div className="text-lg font-black text-[var(--text-primary)]">
              {Number(data.summary.total_reach).toLocaleString("en-IN")}
            </div>
            {/* v332: removed a made-up "72% Impression Penetration" line */}
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-elevated)]/60 border border-[var(--border-default)]">
            <div className="flex items-center justify-between text-[var(--text-secondary)] mb-1">
              <span className="text-[11px] font-semibold">Engaged Likes</span>
              <Heart size={14} className="text-pink-500" />
            </div>
            <div className="text-lg font-black text-[var(--text-primary)]">
              {Number(data.summary.total_likes).toLocaleString("en-IN")}
            </div>
            {/* v332: removed a made-up "High Organic Sentiment" line */}
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-elevated)]/60 border border-[var(--border-default)]">
            <div className="flex items-center justify-between text-[var(--text-secondary)] mb-1">
              <span className="text-[11px] font-semibold">Avg Engagement</span>
                          </div>
            <div className="text-lg font-black text-[var(--text-primary)]">
              {Number.isFinite(Number(data.summary.avg_engagement_rate)) && data.summary.avg_engagement_rate !== null ? `${data.summary.avg_engagement_rate}%` : "—"}
            </div>
            {/* v332: removed a made-up "Top 10% Indian Creator Band" claim shown for every deal */}
          </div>
        </div>
      )}

      {/* v332: loading / couldn't-load states instead of a blank chart area */}
      {!data && loading && (
        <div className="py-10 text-center text-xs text-[var(--text-secondary)]" role="status">Loading performance…</div>
      )}
      {!data && !loading && failed && (
        <div className="py-10 text-center text-xs text-[var(--text-secondary)]">
          Couldn't load performance numbers right now.
          <button type="button" onClick={fetchData} className="mt-3 mx-auto block h-10 px-4 rounded-xl border border-[var(--border-default)] text-xs font-semibold text-[var(--text-primary)]">Try again</button>
        </div>
      )}

      {/* TAB 1: Velocity Curve (D3.js Line & Area Chart) */}
      {activeTab === "velocity" && data && (
        <div className="mt-2">
          {/* Sub-controls: metric switcher & days toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveMetric("views")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeMetric === "views"
                    ? "bg-[#7C3AED] text-white shadow-xs"
                    : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Views
              </button>
              <button
                type="button"
                onClick={() => setActiveMetric("reach")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeMetric === "reach"
                    ? "bg-[#7C3AED] text-white shadow-xs"
                    : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Reach
              </button>
              <button
                type="button"
                onClick={() => setActiveMetric("likes")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeMetric === "likes"
                    ? "bg-pink-600 text-white shadow-xs"
                    : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Likes
              </button>
              <button
                type="button"
                onClick={() => setActiveMetric("engagement")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeMetric === "engagement"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Engagement %
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {activeMetric === "views" && (
                <div className="hidden sm:flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <span className="w-3 h-0.5 border-t border-dashed border-slate-400"></span>
                  <span>Category Benchmark</span>
                </div>
              )}
              <div className="flex items-center bg-[var(--bg-elevated)] rounded-lg p-0.5 border border-[var(--border-default)]">
                <button
                  type="button"
                  onClick={() => setDaysFilter(7)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                    daysFilter === 7 ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs" : "text-[var(--text-secondary)]"
                  }`}
                >
                  7 Days
                </button>
                <button
                  type="button"
                  onClick={() => setDaysFilter(14)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                    daysFilter === 14 ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs" : "text-[var(--text-secondary)]"
                  }`}
                >
                  14 Days
                </button>
              </div>
            </div>
          </div>

          {/* D3 SVG Container */}
          <div className="relative w-full overflow-x-auto">
            <svg
              ref={svgRef}
              viewBox="0 0 760 320"
              className="w-full h-auto min-w-[550px] select-none"
            />
            {/* Dynamic floating tooltip */}
            <div
              ref={tooltipRef}
              className="fixed pointer-events-none z-50 px-2.5 py-1.5 rounded-lg bg-slate-900/90 backdrop-blur-md border border-slate-700 shadow-xl opacity-0 transition-opacity duration-150"
            />
          </div>
        </div>
      )}

      {/* TAB 2: Conversion Funnel */}
      {activeTab === "funnel" && data?.funnel_data && (
        <div className="mt-4 space-y-3">
          <div className="text-xs text-[var(--text-secondary)] mb-2">
            Funnel conversion drop-off analysis from initial impressions to verified conversions.
          </div>
          {data.funnel_data.map((step, idx) => (
            <div key={step.stage} className="p-3 rounded-xl bg-[var(--bg-elevated)]/50 border border-[var(--border-default)]">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#7C3AED]/10 text-[#7C3AED] text-[10px] font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span className="font-bold text-[var(--text-primary)]">{step.stage}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-black text-[var(--text-primary)]">{Number(step.count).toLocaleString("en-IN")}</span>
                  <span className="text-[11px] font-bold text-[#7C3AED] bg-[#7C3AED]/10 px-2 py-0.5 rounded-full">
                    {step.pct}%
                  </span>
                </div>
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#7C3AED] transition-all duration-700"
                  style={{ width: `${step.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: Geographic Metro Breakdown */}
      {activeTab === "geo" && data?.demographics_bubble && (
        <div className="mt-4">
          <div className="text-xs text-[var(--text-secondary)] mb-4">
            Audience geographic distribution across Indian metro clusters:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.demographics_bubble.map((item) => (
              <div
                key={item.name}
                className="p-3.5 rounded-xl bg-[var(--bg-elevated)]/50 border border-[var(--border-default)] flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs font-bold text-[var(--text-primary)]">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-[var(--text-primary)]">{item.value}%</span>
                  <div className="w-16 h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${item.value}%`, backgroundColor: item.color }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer Refresh Note */}
      <div className="mt-4 pt-3 border-t border-[var(--border-default)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
        <span>Grounded via Verified Post Metadata & Platform Graph Analytics</span>
        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1 font-semibold text-[#7C3AED] hover:text-[#7C3AED]"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          <span>Refresh Metrics</span>
        </button>
      </div>
    </div>
  );
}

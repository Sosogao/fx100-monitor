import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MarketSeries, MetricPoint, MonitoringHistoryPoint, MonitoringSnapshot } from "../../shared/monitoring.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const historyDir = path.resolve(__dirname, "..", ".data");
const HISTORY_LIMIT = 720;

interface HistoryFile {
  environment: string;
  points: MonitoringHistoryPoint[];
}

function historyPath(environment: string) {
  return path.join(historyDir, `monitoring-history.${environment}.json`);
}

function pointLabel(timestamp: string): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function roundedPoint(timestamp: string, value: number, digits = 2): MetricPoint {
  return { time: pointLabel(timestamp), value: Number(value.toFixed(digits)) };
}

export async function loadHistory(environment: string): Promise<MonitoringHistoryPoint[]> {
  try {
    const raw = await fs.readFile(historyPath(environment), "utf8");
    const parsed = JSON.parse(raw) as HistoryFile;
    return Array.isArray(parsed.points) ? parsed.points : [];
  } catch {
    return [];
  }
}

export async function appendHistoryPoint(environment: string, point: MonitoringHistoryPoint): Promise<MonitoringHistoryPoint[]> {
  const points = await loadHistory(environment);
  const deduped = points.filter((item) => item.timestamp !== point.timestamp);
  deduped.push(point);
  const trimmed = deduped.slice(-HISTORY_LIMIT);

  try {
    await fs.mkdir(historyDir, { recursive: true });
    await fs.writeFile(historyPath(environment), JSON.stringify({ environment, points: trimmed }, null, 2));
  } catch {
    // Vercel functions do not provide durable writable storage; return the in-memory series instead.
  }

  return trimmed;
}

export function snapshotToHistoryPoint(snapshot: MonitoringSnapshot): MonitoringHistoryPoint {
  return {
    timestamp: snapshot.generatedAt,
    totalOpenInterestUsd: snapshot.markets.reduce((sum, market) => sum + market.openInterestUsd, 0),
    markets: snapshot.markets.map((market) => ({
      symbol: market.symbol,
      fundingAprPct: market.fundingAprPct,
      openInterestUsd: market.openInterestUsd,
      realizedVol1hPct: market.realizedVol1hPct,
    })),
  };
}

export function applyHistoricalSeries(snapshot: MonitoringSnapshot, history: MonitoringHistoryPoint[]): MonitoringSnapshot {
  if (history.length < 2) {
    return snapshot;
  }

  const recent = history.slice(-36);
  const bySymbol = new Map<string, MonitoringHistoryPoint["markets"]>();
  for (const point of recent) {
    for (const market of point.markets) {
      const items = bySymbol.get(market.symbol) ?? [];
      items.push(market);
      bySymbol.set(market.symbol, items);
    }
  }

  const marketSeries: MarketSeries[] = snapshot.markets.map((market) => {
    const samples = recent
      .map((point) => ({ point, market: point.markets.find((item) => item.symbol === market.symbol) }))
      .filter((entry) => entry.market);

    if (samples.length < 2) {
      return snapshot.marketSeries.find((series) => series.symbol === market.symbol) ?? {
        symbol: market.symbol,
        priceVolatility: [],
        fundingApr: [],
        openInterestUsd: [],
      };
    }

    return {
      symbol: market.symbol,
      priceVolatility: samples.map((entry) => roundedPoint(entry.point.timestamp, entry.market!.realizedVol1hPct)),
      fundingApr: samples.map((entry) => roundedPoint(entry.point.timestamp, entry.market!.fundingAprPct)),
      openInterestUsd: samples.map((entry) => roundedPoint(entry.point.timestamp, entry.market!.openInterestUsd, 0)),
    } satisfies MarketSeries;
  });

  const exposureSeries = recent.map((point) => roundedPoint(point.timestamp, point.totalOpenInterestUsd, 0));

  return {
    ...snapshot,
    marketSeries,
    dashboard: {
      ...snapshot.dashboard,
      exposureSeries,
    },
  };
}

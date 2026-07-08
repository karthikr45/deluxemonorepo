import { api, type TrendPoint } from '../lib/api';
import { ErrorBanner } from './error-banner';

export const dynamic = 'force-dynamic';

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`value${accent ? ' accent' : ''}`}>{value}</div>
    </div>
  );
}

function Sparkline({ points }: { points: TrendPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="card">
      <div className="label">Redemptions (last {points.length} active days)</div>
      <div className="sparkline">
        {points.length === 0 && <span className="muted">No redemptions yet</span>}
        {points.map((p) => (
          <div
            key={p.date}
            className="bar"
            style={{ height: `${(p.count / max) * 100}%` }}
            title={`${p.date}: ${p.count} redemptions, R${p.zar.toFixed(2)}`}
          />
        ))}
      </div>
    </div>
  );
}

export default async function OverviewPage() {
  try {
    const [stats, trend] = await Promise.all([api.stats(), api.trend(14)]);
    return (
      <>
        <h1>Overview</h1>
        <p className="page-sub">Live health of the Zenoti ↔ Shopify loyalty middleware.</p>

        <div className="grid">
          <StatCard label="Linked users" value={stats.totalUsers.toLocaleString()} />
          <StatCard
            label="Points outstanding"
            value={stats.totalPointsOutstanding.toLocaleString()}
          />
          <StatCard
            label="Redemptions (total)"
            value={stats.redemptionsTotal.toLocaleString()}
            accent
          />
          <StatCard label="Redemptions (30d)" value={stats.redemptionsLast30d.toLocaleString()} />
          <StatCard
            label="Points redeemed"
            value={stats.pointsRedeemedTotal.toLocaleString()}
          />
          <StatCard
            label="Value issued"
            value={`R${stats.zarIssuedTotal.toFixed(2)}`}
            accent
          />
          <StatCard label="Failed events (24h)" value={stats.failedEventsLast24h.toLocaleString()} />
          <StatCard
            label="Last sync"
            value={stats.lastSyncAt ? new Date(stats.lastSyncAt).toLocaleString() : '—'}
          />
        </div>

        <Sparkline points={trend} />
      </>
    );
  } catch (error) {
    return (
      <>
        <h1>Overview</h1>
        <p className="page-sub">Live health of the Zenoti ↔ Shopify loyalty middleware.</p>
        <ErrorBanner error={error} />
      </>
    );
  }
}

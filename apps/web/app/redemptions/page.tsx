import { api } from '../../lib/api';
import { ErrorBanner } from '../error-banner';

export const dynamic = 'force-dynamic';

function fullName(u?: { firstName: string | null; lastName: string | null; email: string | null }) {
  if (!u) return '—';
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
  return name || u.email || '—';
}

export default async function RedemptionsPage() {
  try {
    const { items, total } = await api.redemptions(100);
    return (
      <>
        <h1>Redemptions</h1>
        <p className="page-sub">{total.toLocaleString()} total · 100 points = R3 · one code per order</p>
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Points</th>
              <th>Value</th>
              <th>Code</th>
              <th>Status</th>
              <th>Issued</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No redemptions yet.
                </td>
              </tr>
            )}
            {items.map((r) => (
              <tr key={r.id}>
                <td>{fullName(r.user)}</td>
                <td>{r.points.toLocaleString()}</td>
                <td>
                  {r.currency} {Number(r.amountZar).toFixed(2)}
                </td>
                <td>{r.discountCode ? <code>{r.discountCode}</code> : <span className="muted">—</span>}</td>
                <td>
                  <span className={`badge ${r.status}`}>{r.status}</span>
                </td>
                <td className="muted">
                  {r.issuedAt ? new Date(r.issuedAt).toLocaleDateString() : '—'}
                </td>
                <td className="muted">
                  {r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  } catch (error) {
    return (
      <>
        <h1>Redemptions</h1>
        <ErrorBanner error={error} />
      </>
    );
  }
}

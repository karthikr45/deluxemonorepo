import { api } from '../../lib/api';
import { ErrorBanner } from '../error-banner';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  try {
    const { items, total } = await api.users(100);
    return (
      <>
        <h1>Users</h1>
        <p className="page-sub">{total.toLocaleString()} total · Shopify ↔ Zenoti identity map</p>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Points</th>
              <th>Shopify ID</th>
              <th>Zenoti guest</th>
              <th>Last synced</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No users yet.
                </td>
              </tr>
            )}
            {items.map((u) => (
              <tr key={u.id}>
                <td>{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</td>
                <td className="muted">{u.email ?? '—'}</td>
                <td>{u.pointsBalance.toLocaleString()}</td>
                <td className="muted">{u.shopifyCustomerId ?? '—'}</td>
                <td>
                  {u.zenotiGuestId ? (
                    <span className="badge SUCCESS">linked</span>
                  ) : (
                    <span className="badge WARN">unlinked</span>
                  )}
                </td>
                <td className="muted">
                  {u.lastSyncedAt ? new Date(u.lastSyncedAt).toLocaleString() : '—'}
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
        <h1>Users</h1>
        <ErrorBanner error={error} />
      </>
    );
  }
}

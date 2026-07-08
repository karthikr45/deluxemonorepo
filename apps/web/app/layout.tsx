import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Deluxe Loyalty Middleware',
  description: 'Zenoti ↔ Shopify loyalty middleware — stats & logs',
};

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/redemptions', label: 'Redemptions' },
  { href: '/users', label: 'Users' },
  { href: '/logs', label: 'Logs' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="layout">
          <aside className="sidebar">
            <div className="brand">
              DELUXE<span>·</span>
            </div>
            <div className="brand-sub">Loyalty Middleware</div>
            <nav className="nav">
              {NAV.map((n) => (
                <a key={n.href} href={n.href}>
                  {n.label}
                </a>
              ))}
            </nav>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}

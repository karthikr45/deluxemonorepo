export function ErrorBanner({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="error-banner">
      Could not reach the middleware API. Is it running at{' '}
      <code>{process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}</code>?
      <br />
      <span className="muted">{msg}</span>
    </div>
  );
}

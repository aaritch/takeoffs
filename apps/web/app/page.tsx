export default function HomePage() {
  return (
    <main className="shell">
      <h1>Takeoff Platform</h1>
      <p>AI-assisted construction quantity takeoff.</p>
      <p className="muted">
        App shell is live. Sign-in, the plan viewer, and takeoff tools land in upcoming work.
      </p>
      <p className="muted">
        Health check: <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}

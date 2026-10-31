export default function Loading() {
  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "3rem 1.2rem", textAlign: "center" }}>
      <div className="spinner" aria-hidden="true" />
      <p className="muted" role="status">Loading EDITH…</p>
    </main>
  );
}

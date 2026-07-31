export default function PlaceholderPage({ title, description }) {
  return (
    <div className="card">
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{description}</p>
      <div style={{marginTop:24,padding:18,borderRadius:14,background:'var(--surface-muted)',color:'var(--text-muted)'}}>
        The route and module position are ready. Add the related database migration, backend API and page components when this feature enters development.
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';

export default function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  to
}) {
  const content = (
    <div
      className="card stat-card"
      style={{
        cursor: to ? 'pointer' : 'default',
        height: '100%'
      }}
    >
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>

        {hint && (
          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: 12,
              marginTop: 5
            }}
          >
            {hint}
          </div>
        )}
      </div>

      <div className="stat-icon">
        {Icon && <Icon size={22} />}
      </div>
    </div>
  );

  if (to) {
    return (
      <Link
        to={to}
        style={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'block'
        }}
      >
        {content}
      </Link>
    );
  }

  return content;
}
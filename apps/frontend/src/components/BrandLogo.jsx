export default function BrandLogo({
  compact = false,
  name,
  tagline = 'Desktop Operations Suite',
  logoUrl
}) {
  const title = name || 'Work Management';
  const src = logoUrl || './company-logo.png';

  return (
    <div className="brand">
      <img src={src} alt={title} />
      {!compact && (
        <div>
          <strong>{title}</strong>
          <small>{tagline}</small>
        </div>
      )}
    </div>
  );
}

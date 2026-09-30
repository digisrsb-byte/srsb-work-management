export const PAYROLL_STATUS_COLORS = {
  DRAFT: '#64748b',
  SUBMITTED: '#d97706',
  APPROVED: '#059669',
  LOCKED: '#2563eb',
  PAID: '#0f766e',
  REJECTED: '#dc2626'
};

const STEPS = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'LOCKED', label: 'Locked' },
  { key: 'PAID', label: 'Paid' }
];

const MUTED = '#cbd5e1';

export default function PayrollStatusStepper({ status }) {
  const currentIndex = STEPS.findIndex((s) => s.key === status);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%', margin: '4px 0 16px' }} aria-label="Payroll status">
      {STEPS.map((step, i) => {
        const color = PAYROLL_STATUS_COLORS[step.key];
        const isComplete = currentIndex >= 0 && i < currentIndex;
        const isCurrent = i === currentIndex;
        const reached = isComplete || isCurrent;
        const nextReached = currentIndex >= 0 && i + 1 <= currentIndex;

        return (
          <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', minWidth: 0 }}>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  position: 'absolute',
                  top: 13,
                  left: 'calc(50% + 16px)',
                  right: 'calc(-50% + 16px)',
                  height: 3,
                  borderRadius: 2,
                  background: nextReached ? PAYROLL_STATUS_COLORS[STEPS[i + 1].key] : '#e2e8f0'
                }}
              />
            )}
            <div
              aria-current={isCurrent ? 'step' : undefined}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                fontSize: 13,
                fontWeight: 800,
                color: isComplete ? 'white' : reached ? color : '#94a3b8',
                background: isComplete ? color : isCurrent ? `${color}1f` : 'white',
                border: `2px solid ${reached ? color : MUTED}`,
                boxShadow: isCurrent ? `0 0 0 4px ${color}26` : 'none',
                zIndex: 1
              }}
            >
              {isComplete ? '✓' : i + 1}
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                fontWeight: isCurrent ? 800 : 600,
                color: reached ? color : '#94a3b8',
                textAlign: 'center'
              }}
            >
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

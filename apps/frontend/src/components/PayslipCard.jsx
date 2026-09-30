import { Download, Printer } from 'lucide-react';
import {
  COMPANY_ADDRESS_DEFAULT,
  COMPANY_LOGO_URL,
  amountInWords,
  buildPayslipDocument,
  formatCurrencyINR,
  formatPayslipAmount
} from '../services/payslip.js';

const miniTable = { minWidth: 0, width: '100%' };
const cell = { padding: '7px 10px', fontSize: 13 };
const amountCell = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' };

function FigureColumn({ title, rows, totalLabel, total, accent }) {
  return (
    <div style={{ flex: '1 1 240px', minWidth: 0, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <table style={miniTable}>
        <thead>
          <tr>
            <th style={{ ...cell, color: accent, background: 'var(--surface-muted)' }}>{title}</th>
            <th style={{ ...amountCell, color: accent, background: 'var(--surface-muted)' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td style={cell}>
                {r.label}
                {r.note && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>({r.note})</span>
                )}
              </td>
              <td style={amountCell}>{formatCurrencyINR(r.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...cell, fontWeight: 700, borderBottom: 0 }}>{totalLabel}</td>
            <td style={{ ...amountCell, fontWeight: 700, borderBottom: 0 }}>{formatCurrencyINR(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function EarningsDeductionsTable({ figures }) {
  if (!figures) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <FigureColumn
        title="Earnings"
        rows={figures.earnings}
        totalLabel="Total Earnings"
        total={figures.totalEarnings}
        accent="#0f766e"
      />
      <FigureColumn
        title="Deductions"
        rows={figures.deductions}
        totalLabel="Total Deductions"
        total={figures.totalDeductions}
        accent="#b91c1c"
      />
    </div>
  );
}

export function NetPayBanner({ netPay, showWords = true }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: '12px 16px',
        borderRadius: 12,
        background: 'var(--primary-soft)',
        border: '1px solid #99f6e4'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontWeight: 700, color: 'var(--primary-dark)' }}>Net Pay</span>
        <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary-dark)' }}>{formatCurrencyINR(netPay)}</span>
      </div>
      {showWords && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{amountInWords(netPay)}</div>
      )}
    </div>
  );
}

export function EmployerContributions({ figures }) {
  if (!figures?.employer?.length) return null;
  return (
    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '10px 0 0' }}>
      Employer contributions (not deducted from pay):{' '}
      {figures.employer.map((c) => `${c.label} ${formatCurrencyINR(c.amount)}`).join(' · ')}
    </p>
  );
}

function DetailGrid({ rows }) {
  return (
    <dl className="pslip-details">
      {rows.flat().filter(Boolean).map(([label, value]) => (
        <div key={label} className="pslip-detail">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }) {
  return (
    <section className="pslip-section">
      <h3 className="pslip-section-title">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Payslip view shared by the admin Employee Payslips page and the employee
 * My Payslips page. `variant` only affects the action buttons. Renders the same
 * sections as generatePayslipPdf.
 */
export default function PayslipCard({
  payslip,
  variant = 'employee',
  onDownload,
  onPrint,
  companyAddressDefault = COMPANY_ADDRESS_DEFAULT
}) {
  if (!payslip) return null;
  const model = buildPayslipDocument(payslip, { companyAddressDefault });
  const { header, earnings, deductions, summary } = model;
  const handlePrint = onPrint || (() => window.print());
  const rowCount = Math.max(earnings.rows.length, deductions.rows.length);
  const earningCols = earnings.showRate ? 3 : 2;

  return (
    <div className="card payslip-print-area pslip" style={{ marginTop: 16 }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .payslip-print-area, .payslip-print-area * { visibility: visible; }
          .payslip-print-area { position: absolute; left: 0; top: 0; width: 100%; border: 0; box-shadow: none; }
          .payslip-actions { display: none !important; }
        }
      `}</style>

      <header className="pslip-header">
        <img
          className="pslip-logo"
          src={COMPANY_LOGO_URL}
          alt=""
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
        <div className="pslip-company">
          <div className="pslip-company-name">{header.companyName}</div>
          <div className="pslip-company-line">{header.address}</div>
          {header.contacts.length ? (
            <div className="pslip-company-line">{header.contacts.join('  |  ')}</div>
          ) : null}
        </div>
      </header>

      <div className="pslip-titlebar">
        <span>{header.title}</span>
        <span>Salary for {header.periodLabel}</span>
      </div>
      <div className="pslip-meta">
        {header.meta.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <Section title="Employee Details">
        <DetailGrid rows={model.employee} />
      </Section>

      <Section title="Attendance & Payable Days">
        <div className="pslip-meta pslip-meta-centered">
          {model.attendance.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Earnings & Deductions">
        <div className="pslip-figures">
          <table className="pslip-table">
            <thead>
              <tr className="pslip-head-earn">
                <th>Earnings</th>
                {earnings.showRate ? <th className="num">Monthly Rate</th> : null}
                <th className="num">{earnings.showRate ? 'Earned' : 'Amount'}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }, (_, i) => {
                const r = earnings.rows[i];
                if (!r) return <tr key={`e-pad-${i}`}><td colSpan={earningCols}>&nbsp;</td></tr>;
                return (
                  <tr key={r.label}>
                    <td>
                      {r.label}
                      {r.note ? <span className="pslip-note"> ({r.note})</span> : null}
                    </td>
                    {earnings.showRate ? <td className="num">{formatPayslipAmount(r.rate)}</td> : null}
                    <td className="num">{formatPayslipAmount(r.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Gross Earnings</td>
                {earnings.showRate ? <td className="num">{formatPayslipAmount(earnings.rateTotal)}</td> : null}
                <td className="num">{formatPayslipAmount(earnings.total)}</td>
              </tr>
            </tfoot>
          </table>

          <table className="pslip-table">
            <thead>
              <tr className="pslip-head-deduct">
                <th>Deductions</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }, (_, i) => {
                const r = deductions.rows[i];
                if (!r) return <tr key={`d-pad-${i}`}><td colSpan={2}>&nbsp;</td></tr>;
                return (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="num">{formatPayslipAmount(r.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total Deductions</td>
                <td className="num">{formatPayslipAmount(deductions.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {model.notes.length ? (
          <ul className="pslip-notes">
            {model.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </Section>

      {model.employer.length ? (
        <Section title="Employer Contributions (not deducted from salary)">
          <table className="pslip-table pslip-table-compact">
            <tbody>
              {model.employer.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td className="num">{formatPayslipAmount(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      <Section title="Salary Summary">
        <div className="pslip-summary">
          <div>
            <span>Gross Earnings</span>
            <strong>{formatPayslipAmount(summary.gross)}</strong>
          </div>
          <div>
            <span>Total Deductions</span>
            <strong>{formatPayslipAmount(summary.totalDeductions)}</strong>
          </div>
          <div className="pslip-summary-net">
            <span>Net Salary Payable</span>
            <strong>INR {formatPayslipAmount(summary.net)}</strong>
          </div>
        </div>
        <p className="pslip-words">
          Net salary in words: <strong>{summary.words || '—'}</strong>
          <span className="pslip-currency">Currency: {summary.currency}</span>
        </p>
      </Section>

      <Section title="Bank & Payment Details">
        <DetailGrid rows={model.bank} />
      </Section>

      <p className="pslip-footer">This is a system-generated payslip and does not require a signature.</p>

      <div className="payslip-actions" style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        {onDownload && (
          <button type="button" className="btn btn-primary" onClick={onDownload}>
            <Download size={16} /> {variant === 'employee' ? 'Download my payslip' : 'Download PDF'}
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={handlePrint}>
          <Printer size={16} /> Print
        </button>
      </div>
    </div>
  );
}

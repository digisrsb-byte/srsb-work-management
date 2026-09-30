import { useEffect, useState } from 'react';
import api from '../../services/api.js';
import PayslipCard from '../../components/PayslipCard.jsx';
import {
  COMPANY_ADDRESS_DEFAULT,
  formatCurrencyINR as inr,
  generatePayslipPdf
} from '../../services/payslip.js';

export default function MyPayslips() {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/payroll/me/payslips')
      .then((res) => setRows(res.data.data || []))
      .catch(() => setError('Unable to load payslips.'));
  }, []);

  async function openPayslip(id) {
    try {
      const res = await api.get(`/payroll/payslips/${id}`);
      setSelected(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to open payslip.');
    }
  }

  async function downloadPdf() {
    if (!selected) return;
    await generatePayslipPdf(selected, { companyAddressDefault: COMPANY_ADDRESS_DEFAULT });
  }

  return (
    <div>
      <div className="section-heading">
        <div>
          <h1 className="page-title">My Payslips</h1>
          <p className="page-subtitle">View and download your generated payslips.</p>
        </div>
      </div>
      {error ? <div className="message-error">{error}</div> : null}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Period</th>
                <th>Net</th>
                <th>Generated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.payslip_id}>
                  <td>{row.payslip_number}</td>
                  <td>{row.period_month}/{row.period_year}</td>
                  <td>{inr(row.net_pay)}</td>
                  <td>{new Date(row.generated_at).toLocaleString()}</td>
                  <td>
                    <button className="btn btn-secondary" type="button" onClick={() => openPayslip(row.payslip_id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PayslipCard
        payslip={selected}
        variant="employee"
        onDownload={downloadPdf}
        companyAddressDefault={COMPANY_ADDRESS_DEFAULT}
      />
    </div>
  );
}

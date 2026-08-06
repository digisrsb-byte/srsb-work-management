import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Download, Eye, FileUp, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import api from '../services/api.js';
import useDebouncedValue from '../hooks/useDebouncedValue.js';
import { useAuth } from '../context/AuthContext.jsx';

const adminRoles = ['SUPER_ADMIN','ADMIN','HR','MANAGER'];
const statuses = ['PENDING','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED'];
const priorities = ['LOW','MEDIUM','HIGH','URGENT'];
const emptyForm = { title: '', description: '', assignedTo: '', startDate: '', dueDate: '', priority: 'MEDIUM', status: 'PENDING', progress: 0, remarks: '', extensionReason: '', attachment: null };
const label = (value) => String(value || '').replaceAll('_',' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const localDateTime = (value) => value ? new Date(value).toISOString().slice(0, 16) : '';
const formatDate = (value) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'No deadline';

async function filePayload(file) {
  if (!file) return null;
  if (file.size > 5 * 1024 * 1024) throw new Error('Attachment must be 5 MB or smaller.');
  const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  return { name: file.name, type: file.type, data };
}

export default function Tasks() {
  const { user } = useAuth();
  const canManage = adminRoles.includes(user?.role);
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState({ history: [], extensions: [], attachments: [] });
  const [extensionTask, setExtensionTask] = useState(null);
  const [extensionForm, setExtensionForm] = useState({ requestedDueDate: '', reason: '' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const loadTasks = useCallback(async () => {
    try { setLoading(true); const response = await api.get('/tasks', { params: { search: debouncedSearch || undefined, status: status || undefined } }); setTasks(response.data.data || []); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Unable to load tasks.'); }
    finally { setLoading(false); }
  }, [debouncedSearch, status]);

  useEffect(() => { loadTasks(); }, [loadTasks]);
  useEffect(() => {
    if (!canManage) return;
    api.get('/employees').then((response) => setEmployees(response.data.data || [])).catch(() => setEmployees([]));
  }, [canManage]);

  const summary = useMemo(() => ({ total: tasks.length, pending: tasks.filter((item) => item.status === 'PENDING').length, progress: tasks.filter((item) => item.status === 'IN_PROGRESS').length, overdue: tasks.filter((item) => !['COMPLETED','CANCELLED'].includes(item.status) && item.due_date && new Date(item.due_date) < new Date()).length }), [tasks]);

  function openCreate() { setEditing(null); setForm(emptyForm); setShowForm(true); }
  function openEdit(task) {
    setEditing(task); setForm({ title: task.title || '', description: task.description || '', assignedTo: task.assigned_to || '', startDate: localDateTime(task.start_date), dueDate: localDateTime(task.due_date), priority: task.priority || 'MEDIUM', status: task.status || 'PENDING', progress: task.progress || 0, remarks: task.remarks || '', extensionReason: '', attachment: null }); setShowForm(true);
  }
  function setField(event) { const { name, value, files } = event.target; setForm((current) => ({ ...current, [name]: files ? files[0] : value })); }

  async function saveTask(event) {
    event.preventDefault();
    try {
      setSaving(true); setError(''); const payload = { ...form, attachment: await filePayload(form.attachment), progress: Number(form.progress) };
      const response = editing ? await api.put(`/tasks/${editing.id}`, payload) : await api.post('/tasks', payload);
      setMessage(response.data.message); setShowForm(false); setEditing(null); await loadTasks();
    } catch (requestError) { setError(requestError.response?.data?.message || requestError.message || 'Task could not be saved.'); }
    finally { setSaving(false); }
  }

  async function updateStatus(task, nextStatus, progress) {
    try { const response = await api.patch(`/tasks/${task.id}/status`, { status: nextStatus, progress: Number(progress) }); setMessage(response.data.message); await loadTasks(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Task status could not be updated.'); }
  }

  async function viewHistory(task) {
    try { const response = await api.get(`/tasks/${task.id}/history`); setSelected(task); setHistory(response.data.data || { history: [], extensions: [], attachments: [] }); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Task history could not be loaded.'); }
  }

  async function requestExtension(event) {
    event.preventDefault();
    try { setSaving(true); const response = await api.post(`/tasks/${extensionTask.id}/extensions`, extensionForm); setMessage(response.data.message); setExtensionTask(null); await loadTasks(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Extension request could not be submitted.'); }
    finally { setSaving(false); }
  }

  async function reviewExtension(extensionId, decision) {
    const reviewerComment = window.prompt(`${decision === 'APPROVED' ? 'Approval' : 'Rejection'} comment (optional):`) || '';
    try { const response = await api.patch(`/tasks/extensions/${extensionId}`, { decision, reviewerComment }); setMessage(response.data.message); if (selected) await viewHistory(selected); await loadTasks(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Extension could not be reviewed.'); }
  }

  async function uploadAttachment(task, file) {
    if (!file) return;
    try { const response = await api.post(`/tasks/${task.id}/attachments`, { attachment: await filePayload(file) }); setMessage(response.data.message); if (selected?.id === task.id) await viewHistory(task); await loadTasks(); }
    catch (requestError) { setError(requestError.response?.data?.message || requestError.message || 'Attachment could not be uploaded.'); }
  }

  async function downloadAttachment(attachment) {
    try { const response = await api.get(`/tasks/attachments/${attachment.id}/download`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = attachment.file_name; link.click(); URL.revokeObjectURL(url); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Attachment could not be downloaded.'); }
  }

  async function removeTask(task) {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    try { const response = await api.delete(`/tasks/${task.id}`); setMessage(response.data.message); await loadTasks(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Task could not be deleted.'); }
  }

  return <div className="module-page">
    <div className="page-heading-row"><div><p className="eyebrow">Work Management</p><h1 className="page-title">Tasks</h1><p className="page-subtitle">Edit assignments, extend deadlines, record history and exchange task attachments.</p></div>{canManage && <button className="btn btn-primary" onClick={openCreate}><Plus size={18}/> Assign Task</button>}</div>
    {message && <div className="message message-success">{message}</div>}{error && <div className="message message-error">{error}</div>}
    <div className="summary-grid summary-grid-4"><div className="summary-card"><span>Total</span><strong>{summary.total}</strong></div><div className="summary-card warning"><span>Pending</span><strong>{summary.pending}</strong></div><div className="summary-card"><span>In Progress</span><strong>{summary.progress}</strong></div><div className="summary-card danger"><span>Overdue</span><strong>{summary.overdue}</strong></div></div>

    {showForm && <form className="card form-card" onSubmit={saveTask}><div className="section-heading"><div><h2>{editing ? 'Edit Task' : 'Assign Task'}</h2><p className="page-subtitle">Every changed value, including an extended due date, is saved in the task history.</p></div><button className="icon-btn" type="button" onClick={() => setShowForm(false)}><X size={20}/></button></div><div className="form-grid form-grid-3"><label className="form-group form-span-2"><span>Task Title *</span><input className="input" name="title" value={form.title} onChange={setField} required /></label><label className="form-group"><span>Assigned Employee *</span><select className="input" name="assignedTo" value={form.assignedTo} onChange={setField} required><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} {employee.employee_id ? `(${employee.employee_id})` : ''}</option>)}</select></label><label className="form-group form-span-3"><span>Description</span><textarea className="input" rows="3" name="description" value={form.description} onChange={setField}/></label><label className="form-group"><span>Start Date</span><input className="input" type="datetime-local" name="startDate" value={form.startDate} onChange={setField}/></label><label className="form-group"><span>Due Date</span><input className="input" type="datetime-local" name="dueDate" value={form.dueDate} onChange={setField}/></label><label className="form-group"><span>Priority</span><select className="input" name="priority" value={form.priority} onChange={setField}>{priorities.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>{editing && <><label className="form-group"><span>Status</span><select className="input" name="status" value={form.status} onChange={setField}>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label><label className="form-group"><span>Progress %</span><input className="input" type="number" min="0" max="100" name="progress" value={form.progress} onChange={setField}/></label><label className="form-group"><span>Reason for Due-Date Change{localDateTime(editing?.due_date) !== form.dueDate ? ' *' : ''}</span><input className="input" name="extensionReason" value={form.extensionReason} onChange={setField} required={localDateTime(editing?.due_date) !== form.dueDate}/></label></>}<label className="form-group form-span-2"><span>Remarks</span><input className="input" name="remarks" value={form.remarks} onChange={setField}/></label><label className="form-group"><span>Attachment (max 5 MB)</span><input className="input" type="file" name="attachment" onChange={setField}/></label></div><div className="form-actions"><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Task'}</button><button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button></div></form>}

    <div className="card toolbar"><div className="search-box"><Search size={18}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search task, employee or department" /></div><select className="input compact-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All Statuses</option>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></div>
    <div className="task-grid">{loading ? <div className="card">Loading tasks...</div> : tasks.length === 0 ? <div className="card empty-state">No tasks found.</div> : tasks.map((task) => <article className={`card task-card task-priority-${String(task.priority).toLowerCase()}`} key={task.id}><div className="task-card-head"><div><span className="status-badge">{label(task.priority)}</span><h3>{task.title}</h3><p>{task.description || 'No description'}</p></div><div className="row-actions">{canManage && <button className="icon-btn" title="Edit task" onClick={() => openEdit(task)}><Pencil size={16}/></button>}<button className="icon-btn" title="History" onClick={() => viewHistory(task)}><Eye size={16}/></button>{canManage && <button className="icon-btn danger" title="Delete" onClick={() => removeTask(task)}><Trash2 size={16}/></button>}</div></div><div className="task-meta"><span><b>Assigned:</b> {task.assignee_name}</span><span><b>Due:</b> {formatDate(task.due_date)}</span><span><b>Status:</b> {label(task.status)}</span><span><b>Progress:</b> {task.progress || 0}%</span></div><div className="progress-track"><div style={{ width: `${Number(task.progress || 0)}%` }}/></div><div className="task-actions"><select className="input" value={task.status} onChange={(event) => { const next = event.target.value; const progress = next === 'COMPLETED' ? 100 : next === 'PENDING' || next === 'CANCELLED' ? 0 : Math.min(Math.max(Number(task.progress || 1), 1), 99); updateStatus(task, next, progress); }}>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select><input className="input" type="number" min="0" max="100" defaultValue={task.progress || 0} key={`${task.id}-${task.progress}`} onBlur={(event) => { const progress = Math.min(Math.max(Number(event.target.value || 0), 0), 100); const nextStatus = task.status === 'BLOCKED' ? 'BLOCKED' : progress === 0 ? 'PENDING' : progress === 100 ? 'COMPLETED' : 'IN_PROGRESS'; updateStatus(task, nextStatus, progress); }}/><button className="btn btn-secondary" onClick={() => { if (canManage) openEdit(task); else { setExtensionTask(task); setExtensionForm({ requestedDueDate: '', reason: '' }); } }}><CalendarClock size={16}/> {canManage ? 'Edit Deadline' : 'Request Extension'}</button><label className="btn btn-secondary file-button"><FileUp size={16}/> Attach<input type="file" hidden onChange={(event) => uploadAttachment(task, event.target.files?.[0])}/></label></div>{task.extension_status && <div className={`extension-banner status-${String(task.extension_status).toLowerCase()}`}>Latest extension: {label(task.extension_status)} {task.requested_due_date ? `until ${formatDate(task.requested_due_date)}` : ''}</div>}</article>)}</div>

    {extensionTask && <div className="modal-overlay"><form className="modal-card" onSubmit={requestExtension}><div className="section-heading"><h2>Request Due-Date Extension</h2><button className="icon-btn" type="button" onClick={() => setExtensionTask(null)}><X size={20}/></button></div><p><b>{extensionTask.title}</b><br/>Current due date: {formatDate(extensionTask.due_date)}</p><label className="form-group"><span>New Due Date *</span><input className="input" type="datetime-local" value={extensionForm.requestedDueDate} onChange={(event) => setExtensionForm((current) => ({ ...current, requestedDueDate: event.target.value }))} required /></label><label className="form-group"><span>Reason *</span><textarea className="input" rows="3" value={extensionForm.reason} onChange={(event) => setExtensionForm((current) => ({ ...current, reason: event.target.value }))} required /></label><button className="btn btn-primary" disabled={saving}>Submit Request</button></form></div>}

    {selected && <div className="modal-overlay"><div className="modal-card modal-wide"><div className="section-heading"><div><h2>{selected.title} — History</h2><p className="page-subtitle">Original values and every later change remain visible.</p></div><button className="icon-btn" onClick={() => setSelected(null)}><X size={20}/></button></div><h3>Extension Requests</h3><div className="history-list">{history.extensions.length === 0 ? <p className="empty-copy">No extension requests.</p> : history.extensions.map((item) => <div className="history-row" key={item.id}><div><strong>{label(item.status)} — {formatDate(item.requested_due_date)}</strong><span>{item.requested_by_name}: {item.reason}</span></div>{canManage && item.status === 'PENDING' && Number(item.requested_by) !== Number(user.id) && <div className="row-actions"><button className="btn btn-primary btn-small" onClick={() => reviewExtension(item.id, 'APPROVED')}>Approve</button><button className="btn btn-secondary btn-small" onClick={() => reviewExtension(item.id, 'REJECTED')}>Reject</button></div>}</div>)}</div><h3>Attachments</h3><div className="history-list">{history.attachments.length === 0 ? <p className="empty-copy">No attachments.</p> : history.attachments.map((item) => <div className="history-row" key={item.id}><div><strong>{item.file_name}</strong><span>Uploaded by {item.uploaded_by_name || 'Employee'} · {formatDate(item.created_at)}</span></div><button className="icon-btn" onClick={() => downloadAttachment(item)}><Download size={16}/></button></div>)}</div><h3>Change History</h3><div className="history-list">{history.history.map((item) => <div className="history-row" key={item.id}><div><strong>{label(item.change_type)} {item.field_name ? `— ${item.field_name}` : ''}</strong><span>{item.changed_by_name || 'System'} · {formatDate(item.created_at)}{item.old_value || item.new_value ? ` · ${item.old_value || '—'} → ${item.new_value || '—'}` : ''}{item.reason ? ` · ${item.reason}` : ''}</span></div></div>)}</div></div></div>}
  </div>;
}

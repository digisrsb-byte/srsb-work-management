import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ListTodo,
  Search,
  Send,
  UserRound
} from 'lucide-react';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import useDebouncedValue from '../hooks/useDebouncedValue.js';

const adminRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'HR',
  'MANAGER'
];

const initialTaskForm = {
  title: '',
  description: '',
  assignedTo: '',
  dueDate: '',
  priority: 'MEDIUM'
};

const statusOptions = [
  {
    value: 'PENDING',
    label: 'Pending'
  },
  {
    value: 'IN_PROGRESS',
    label: 'In Progress'
  },
  {
    value: 'COMPLETED',
    label: 'Completed'
  }
];

const priorityOptions = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT'
];

function formatText(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return 'No deadline';

  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

export default function Tasks() {
  const { user } = useAuth();

  const canAssignTasks = adminRoles.includes(user?.role);

  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [taskForm, setTaskForm] = useState(initialTaskForm);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [taskSearch, setTaskSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState(null);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const hasLoadedRef = useRef(false);

  const showMessage = (text) => {
    setError('');
    setMessage(text);
  };

  const showError = (text) => {
    setMessage('');
    setError(text);
  };

  const debouncedTaskSearch = useDebouncedValue(taskSearch, 300);
  const debouncedEmployeeSearch = useDebouncedValue(
    employeeSearch,
    300
  );

  const loadTasks = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent && !hasLoadedRef.current) {
        setLoading(true);
      }

      const params = {};

      if (debouncedTaskSearch.trim()) {
        params.search = debouncedTaskSearch.trim();
      }

      const response = await api.get('/tasks', { params });
      setTasks(response.data.data || []);
    } catch (err) {
      showError(
        err.response?.data?.message ||
          'Unable to load tasks.'
      );
    } finally {
      if (!silent) {
        setLoading(false);
      }
      hasLoadedRef.current = true;
    }
  }, [debouncedTaskSearch]);

  const loadEmployees = useCallback(async () => {
    if (!canAssignTasks) {
      setEmployees([]);
      return;
    }

    try {
      const params = { status: 'ACTIVE' };

      if (debouncedEmployeeSearch.trim()) {
        params.search = debouncedEmployeeSearch.trim();
      }

      const response = await api.get('/employees', { params });
      setEmployees(response.data.data || []);
    } catch (err) {
      showError(
        err.response?.data?.message ||
          'Unable to load employees.'
      );
    }
  }, [canAssignTasks, debouncedEmployeeSearch]);

  useEffect(() => {
    setError('');
    loadTasks();
  }, [loadTasks, user?.role]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const filteredEmployees = employees;
  const filteredTasks = tasks;

  const handleTaskFormChange = (event) => {
    const { name, value } = event.target;

    setTaskForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const createTask = async (event) => {
    event.preventDefault();

    if (!taskForm.assignedTo) {
      showError('Select an employee for this task.');
      return;
    }

    try {
      setCreating(true);
      setError('');
      setMessage('');

      const response = await api.post('/tasks', {
        title: taskForm.title,
        description: taskForm.description,
        assignedTo: Number(taskForm.assignedTo),
        dueDate: taskForm.dueDate || null,
        priority: taskForm.priority
      });

      showMessage(
        response.data.message ||
          'Task assigned successfully.'
      );

      setTaskForm(initialTaskForm);
      setEmployeeSearch('');

      await loadTasks();
    } catch (err) {
      showError(
        err.response?.data?.message ||
          'Unable to assign task.'
      );
    } finally {
      setCreating(false);
    }
  };

  const updateLocalTask = (
    taskId,
    field,
    value
  ) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== taskId) return task;

        const updatedTask = {
          ...task,
          [field]: value
        };

        if (field === 'status') {
          if (value === 'PENDING') {
            updatedTask.progress = 0;
          }

          if (value === 'IN_PROGRESS') {
            const existingProgress = Number(
              task.progress || 0
            );

            updatedTask.progress =
              existingProgress > 0 &&
              existingProgress < 100
                ? existingProgress
                : 10;
          }

          if (value === 'COMPLETED') {
            updatedTask.progress = 100;
          }
        }

        return updatedTask;
      })
    );
  };

  const saveTaskStatus = async (task) => {
    try {
      setSavingTaskId(task.id);
      setError('');
      setMessage('');

      const response = await api.patch(
        `/tasks/${task.id}/status`,
        {
          status: task.status,
          progress: Number(task.progress)
        }
      );

      showMessage(
        response.data.message ||
          'Task updated successfully.'
      );

      await loadTasks();
    } catch (err) {
      showError(
        err.response?.data?.message ||
          'Unable to update task.'
      );
    } finally {
      setSavingTaskId(null);
    }
  };

  if (loading) {
    return (
      <div className="card">
        Loading tasks...
      </div>
    );
  }

  return (
    <>
      <style>
        {`
          .tasks-page-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 18px;
            margin-bottom: 24px;
            flex-wrap: wrap;
          }

          .tasks-summary {
            display: grid;
            grid-template-columns:
              repeat(auto-fit, minmax(190px, 1fr));
            gap: 14px;
            margin-bottom: 22px;
          }

          .task-summary-card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 18px;
            padding: 18px;
            display: flex;
            align-items: center;
            gap: 14px;
          }

          .task-summary-icon {
            width: 44px;
            height: 44px;
            border-radius: 13px;
            display: grid;
            place-items: center;
            background: var(--surface-muted);
            flex-shrink: 0;
          }

          .task-form-card {
            margin-bottom: 22px;
          }

          .task-form-grid {
            display: grid;
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
            gap: 18px;
          }

          .task-field {
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-size: 13px;
            font-weight: 700;
          }

          .task-field-full {
            grid-column: 1 / -1;
          }

          .task-field input,
          .task-field select,
          .task-field textarea,
          .task-search-input {
            width: 100%;
            min-height: 44px;
            padding: 11px 13px;
            border-radius: 11px;
            border: 1px solid var(--border);
            background: var(--surface);
            color: var(--text);
            font: inherit;
            outline: none;
            transition:
              border-color 0.2s ease,
              box-shadow 0.2s ease;
          }

          .task-field textarea {
            min-height: 105px;
            resize: vertical;
          }

          .task-field input:focus,
          .task-field select:focus,
          .task-field textarea:focus,
          .task-search-input:focus {
            border-color: #0f766e;
            box-shadow:
              0 0 0 3px rgba(15, 118, 110, 0.12);
          }

          .employee-search-results {
            border: 1px solid var(--border);
            border-radius: 12px;
            max-height: 230px;
            overflow-y: auto;
            background: var(--surface);
          }

          .employee-option {
            width: 100%;
            border: 0;
            border-bottom: 1px solid var(--border);
            background: transparent;
            padding: 12px;
            text-align: left;
            cursor: pointer;
            color: var(--text);
          }

          .employee-option:last-child {
            border-bottom: 0;
          }

          .employee-option:hover,
          .employee-option-selected {
            background: var(--surface-muted);
          }

          .employee-option-name {
            display: block;
            font-weight: 700;
            margin-bottom: 4px;
          }

          .employee-option-details {
            display: block;
            color: var(--text-muted);
            font-size: 12px;
          }

          .selected-employee {
            margin-top: 10px;
            border-radius: 11px;
            padding: 11px 13px;
            background: rgba(15, 118, 110, 0.1);
            color: #0f766e;
            font-size: 13px;
            font-weight: 700;
          }

          .task-search-wrap {
            position: relative;
            width: min(360px, 100%);
          }

          .task-search-wrap svg {
            position: absolute;
            left: 13px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-muted);
          }

          .task-search-input {
            padding-left: 42px;
          }

          .task-list {
            display: grid;
            gap: 16px;
          }

          .task-item {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 17px;
            padding: 18px;
          }

          .task-item-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 14px;
            margin-bottom: 14px;
            flex-wrap: wrap;
          }

          .task-title {
            margin: 0 0 6px;
            font-size: 17px;
          }

          .task-description {
            margin: 0;
            color: var(--text-muted);
            font-size: 13px;
            line-height: 1.6;
          }

          .task-meta-grid {
            display: grid;
            grid-template-columns:
              repeat(auto-fit, minmax(160px, 1fr));
            gap: 12px;
            margin: 16px 0;
          }

          .task-meta-item {
            background: var(--surface-muted);
            padding: 11px 12px;
            border-radius: 11px;
          }

          .task-meta-label {
            display: block;
            font-size: 11px;
            color: var(--text-muted);
            margin-bottom: 5px;
          }

          .task-meta-value {
            font-size: 13px;
            font-weight: 700;
          }

          .task-controls {
            display: grid;
            grid-template-columns:
              minmax(150px, 220px)
              minmax(200px, 1fr)
              auto;
            gap: 14px;
            align-items: end;
            padding-top: 15px;
            border-top: 1px solid var(--border);
          }

          .task-progress-row {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .task-progress-row input {
            width: 100%;
          }

          .task-update-button {
            min-height: 42px;
            white-space: nowrap;
          }

          @media (max-width: 760px) {
            .task-form-grid {
              grid-template-columns: 1fr;
            }

            .task-field-full {
              grid-column: auto;
            }

            .task-controls {
              grid-template-columns: 1fr;
            }

            .task-update-button {
              width: 100%;
            }
          }
        `}
      </style>

      <div className="tasks-page-header">
        <div>
          <h1 className="page-title">
            {canAssignTasks
              ? 'Task Management'
              : 'My Tasks'}
          </h1>

          <p className="page-subtitle">
            {canAssignTasks
              ? 'Assign work to employees and monitor progress.'
              : 'View your assigned work and update progress.'}
          </p>
        </div>

        <div className="task-search-wrap">
          <Search size={18} />

          <input
            type="search"
            className="task-search-input"
            placeholder="Search tasks or employees..."
            value={taskSearch}
            onInput={(event) =>
              setTaskSearch(event.currentTarget.value)
            }
            autoComplete="off"
            aria-label="Search tasks"
          />
        </div>
      </div>

      {message && (
        <div className="message message-success">
          {message}
        </div>
      )}

      {error && (
        <div className="message message-error">
          {error}
        </div>
      )}

      <div className="tasks-summary">
        <div className="task-summary-card">
          <div className="task-summary-icon">
            <ListTodo size={21} />
          </div>

          <div>
            <div className="stat-label">
              Total Tasks
            </div>

            <div className="stat-value">
              {tasks.length}
            </div>
          </div>
        </div>

        <div className="task-summary-card">
          <div className="task-summary-icon">
            <CalendarDays size={21} />
          </div>

          <div>
            <div className="stat-label">
              Pending
            </div>

            <div className="stat-value">
              {
                tasks.filter(
                  (task) =>
                    task.status === 'PENDING'
                ).length
              }
            </div>
          </div>
        </div>

        <div className="task-summary-card">
          <div className="task-summary-icon">
            <CheckCircle2 size={21} />
          </div>

          <div>
            <div className="stat-label">
              Completed
            </div>

            <div className="stat-value">
              {
                tasks.filter(
                  (task) =>
                    task.status === 'COMPLETED'
                ).length
              }
            </div>
          </div>
        </div>
      </div>

      {canAssignTasks && (
        <form
          className="card task-form-card"
          onSubmit={createTask}
        >
          <div className="section-heading">
            <div>
              <h2>Assign New Task</h2>

              <p className="page-subtitle">
                Search and select an employee, then add
                the task details.
              </p>
            </div>

            <Send size={21} />
          </div>

          <div className="task-form-grid">
            <label className="task-field">
              Task Title

              <input
                type="text"
                name="title"
                placeholder="Example: Source candidates for Office Boy"
                value={taskForm.title}
                onChange={handleTaskFormChange}
                required
              />
            </label>

            <label className="task-field">
              Priority

              <select
                name="priority"
                value={taskForm.priority}
                onChange={handleTaskFormChange}
              >
                {priorityOptions.map((priority) => (
                  <option
                    key={priority}
                    value={priority}
                  >
                    {formatText(priority)}
                  </option>
                ))}
              </select>
            </label>

            <label className="task-field">
              Due Date and Time

              <input
                type="datetime-local"
                name="dueDate"
                value={taskForm.dueDate}
                onChange={handleTaskFormChange}
              />
            </label>

            <div className="task-field">
              Search Employee

              <input
                type="search"
                placeholder="Search by name, ID or department"
                value={employeeSearch}
                onInput={(event) =>
                  setEmployeeSearch(event.currentTarget.value)
                }
                autoComplete="off"
                aria-label="Search employees for task assignment"
              />

              <div className="employee-search-results">
                {filteredEmployees.map((employee) => {
                  const selected =
                    Number(taskForm.assignedTo) ===
                    employee.id;

                  return (
                    <button
                      type="button"
                      key={employee.id}
                      className={`employee-option ${
                        selected
                          ? 'employee-option-selected'
                          : ''
                      }`}
                      onClick={() =>
                        setTaskForm((current) => ({
                          ...current,
                          assignedTo: String(
                            employee.id
                          )
                        }))
                      }
                    >
                      <span className="employee-option-name">
                        {employee.full_name}
                      </span>

                      <span className="employee-option-details">
                        {employee.employee_id}
                        {employee.designation
                          ? ` • ${employee.designation}`
                          : ''}
                        {employee.department
                          ? ` • ${employee.department}`
                          : ''}
                      </span>
                    </button>
                  );
                })}

                {!filteredEmployees.length && (
                  <div
                    style={{
                      padding: 14,
                      color: 'var(--text-muted)',
                      fontSize: 13
                    }}
                  >
                    No employees found.
                  </div>
                )}
              </div>

              {taskForm.assignedTo && (
                <div className="selected-employee">
                  <UserRound
                    size={15}
                    style={{
                      marginRight: 6,
                      verticalAlign: 'middle'
                    }}
                  />

                  Assigned to:{' '}
                  {
                    employees.find(
                      (employee) =>
                        employee.id ===
                        Number(
                          taskForm.assignedTo
                        )
                    )?.full_name
                  }
                </div>
              )}
            </div>

            <label className="task-field task-field-full">
              Description

              <textarea
                name="description"
                placeholder="Add complete instructions, client name, requirement and expected result."
                value={taskForm.description}
                onChange={handleTaskFormChange}
              />
            </label>
          </div>

          <button
            type="submit"
            className="button"
            disabled={creating}
            style={{ marginTop: 18 }}
          >
            {creating
              ? 'Assigning...'
              : 'Assign Task'}
          </button>
        </form>
      )}

      <div className="task-list">
        {filteredTasks.map((task) => (
          <article
            className="task-item"
            key={task.id}
          >
            <div className="task-item-header">
              <div>
                <h3 className="task-title">
                  {task.title}
                </h3>

                <p className="task-description">
                  {task.description ||
                    'No task description provided.'}
                </p>
              </div>

              <span
                className={`badge badge-${String(
                  task.priority || 'MEDIUM'
                ).toLowerCase()}`}
              >
                {formatText(task.priority)}
              </span>
            </div>

            <div className="task-meta-grid">
              <div className="task-meta-item">
                <span className="task-meta-label">
                  Assigned To
                </span>

                <span className="task-meta-value">
                  {task.assignee_name || '—'}
                </span>
              </div>

              <div className="task-meta-item">
                <span className="task-meta-label">
                  Assigned By
                </span>

                <span className="task-meta-value">
                  {task.assigned_by_name || '—'}
                </span>
              </div>

              <div className="task-meta-item">
                <span className="task-meta-label">
                  Deadline
                </span>

                <span className="task-meta-value">
                  {formatDate(task.due_date)}
                </span>
              </div>

              <div className="task-meta-item">
                <span className="task-meta-label">
                  Current Status
                </span>

                <span className="task-meta-value">
                  {formatText(task.status)}
                </span>
              </div>
            </div>

            <div className="task-controls">
              <label className="task-field">
                Status

                <select
                  value={task.status || 'PENDING'}
                  onChange={(event) =>
                    updateLocalTask(
                      task.id,
                      'status',
                      event.target.value
                    )
                  }
                >
                  {statusOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="task-field">
                Progress

                <div className="task-progress-row">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Number(
                      task.progress || 0
                    )}
                    disabled={
                      task.status === 'PENDING' ||
                      task.status === 'COMPLETED'
                    }
                    onChange={(event) =>
                      updateLocalTask(
                        task.id,
                        'progress',
                        Number(
                          event.target.value
                        )
                      )
                    }
                  />

                  <strong>
                    {Number(task.progress || 0)}%
                  </strong>
                </div>
              </label>

              <button
                type="button"
                className="button task-update-button"
                disabled={
                  savingTaskId === task.id
                }
                onClick={() =>
                  saveTaskStatus(task)
                }
              >
                {savingTaskId === task.id
                  ? 'Saving...'
                  : 'Update Task'}
              </button>
            </div>
          </article>
        ))}

        {!filteredTasks.length && (
          <div className="card">
            No tasks found.
          </div>
        )}
      </div>
    </>
  );
}
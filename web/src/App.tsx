import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createAlternative,
  deleteAlternative,
  listAlternatives,
  listUsers,
  updateAlternative,
  updateUserRole,
  type Alternative,
  type AlternativePage,
  type User,
  type UserPage,
} from "./api";
import {
  currentEmail,
  hasRole,
  initializeAuth,
  login,
  logout,
  register,
} from "./auth";

type View = "search" | "submissions" | "moderation" | "approved" | "users";
const taskPath = /^\/tasks\/\d+\/?$/;

const unavailable = [
  "Free-text search",
  "Device filter",
  "Compatibility details",
  "Ratings",
  "Natural-language search",
  "Recommendation agent",
  "Device camera scan",
  "Notifications",
  "Task and device moderation",
];

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [view, setView] = useState<View>("search");
  const [message, setMessage] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    function syncPath() {
      setPath(window.location.pathname);
    }
    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, []);

  useEffect(() => {
    let active = true;
    void initializeAuth()
      .then((authenticatedUser) => {
        if (!active) return;
        setAuthenticated(authenticatedUser);
        setAdmin(hasRole("admin"));
      })
      .catch((error: unknown) => {
        if (active) setMessage(errorMessage(error));
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  function navigate(nextPath: string) {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setPath(nextPath);
  }

  function startAuthentication(action: "login" | "register") {
    setMessage("");
    const redirect = action === "register" ? register : login;
    void redirect().catch((error: unknown) => setMessage(errorMessage(error)));
  }

  async function handleLogout() {
    try {
      await logout();
      setAuthenticated(false);
      setAdmin(false);
      setView("search");
      navigate("/");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SOFTWARE · SECOND LIFE</p>
          <h1>Keep your devices useful for longer</h1>
        </div>
        <div className="account">
          {authenticated ? (
            <>
              <span>{currentEmail() || "Signed in"}</span>
              <button className="button secondary" onClick={() => void handleLogout()}>Sign out</button>
            </>
          ) : (
            <>
              <button
                className="button"
                disabled={!authReady}
                onClick={() => startAuthentication("login")}
              >
                Sign in
              </button>
              <button
                className="button secondary"
                disabled={!authReady}
                onClick={() => startAuthentication("register")}
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </header>

      <nav className="navigation" aria-label="Main navigation">
        <NavButton active={view === "search" && !taskPath.test(path)} onClick={() => {
          setView("search");
          navigate("/");
        }}>Search</NavButton>
        <NavButton
          active={view === "submissions"}
          disabled={!authenticated}
          title={!authenticated ? "Sign in to access your submissions." : undefined}
          onClick={() => {
            setView("submissions");
            navigate("/");
          }}
        >
          My submissions
        </NavButton>
        <NavButton
          active={view === "moderation"}
          disabled={!admin}
          title={!admin ? "Administrators only." : undefined}
          onClick={() => {
            setView("moderation");
            navigate("/");
          }}
        >
          Moderation
        </NavButton>
        <NavButton
          active={view === "approved"}
          disabled={!admin}
          title={!admin ? "Administrators only." : undefined}
          onClick={() => {
            setView("approved");
            navigate("/");
          }}
        >
          Approved alternatives
        </NavButton>
        <NavButton
          active={view === "users"}
          disabled={!admin}
          title={!admin ? "Administrators only." : undefined}
          onClick={() => {
            setView("users");
            navigate("/");
          }}
        >
          Users
        </NavButton>
      </nav>
      <section className="unavailable-area" aria-label="Unavailable features">
        <span>Coming later:</span>
        {unavailable.map((feature) => (
          <button
            className="unavailable-chip"
            disabled
            key={feature}
            title="This feature is not currently supported by the API."
          >
            {feature}
          </button>
        ))}
      </section>

      {message && (
        <div className="notice error" role="alert">
          {message}
          <button className="notice-close" onClick={() => setMessage("")} aria-label="Dismiss">×</button>
        </div>
      )}

      {taskPath.test(path) ? (
        <TaskDetailsPage onBack={() => navigate("/")} />
      ) : (
        <>
          {view === "search" && (
            <SearchView onError={setMessage} onNavigateToTask={(id) => navigate(`/tasks/${id}`)} />
          )}
          {view === "submissions" && authenticated && <SubmissionsView onError={setMessage} />}
          {view === "moderation" && admin && <ModerationView onError={setMessage} />}
          {view === "approved" && admin && <ApprovedAlternativesView onError={setMessage} />}
          {view === "users" && admin && <UsersView onError={setMessage} />}
        </>
      )}

      <footer>
        <span>API-powered features reflect the current API contract.</span>
        <span className="legend"><i /> Not yet supported by the API</span>
      </footer>
    </main>
  );
}

function NavButton(props: {
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      className={`nav-button${props.active ? " active" : ""}`}
      disabled={props.disabled}
      title={props.title}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function SearchView({ onError, onNavigateToTask }: {
  onError: (message: string) => void;
  onNavigateToTask: (id: number) => void;
}) {
  const [taskId, setTaskId] = useState("");
  const [page, setPage] = useState<AlternativePage | null>(null);
  const [selectedAlternative, setSelectedAlternative] = useState<Alternative | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (nextPage: number, taskFilter: string) => {
    if (taskFilter && (!Number.isInteger(Number(taskFilter)) || Number(taskFilter) < 1)) {
      onError("Task ID must be a positive integer.");
      return;
    }
    setLoading(true);
    onError("");
    try {
      const results = await listAlternatives({
        page: nextPage,
        status: "approved",
        ...(taskFilter ? { taskId: Number(taskFilter) } : {}),
      });
      setPage(results);
      setPageNumber(nextPage);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { void search(1, ""); }, [search]);

  if (selectedAlternative) {
    return (
      <AlternativeDetails
        item={selectedAlternative}
        onBack={() => setSelectedAlternative(null)}
        onNavigateToTask={onNavigateToTask}
      />
    );
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PUBLIC CATALOG</p>
          <h2>Find a software alternative</h2>
        </div>
        <span className="pill">Approved alternatives</span>
      </div>
      <form className="search-form" onSubmit={(event) => {
        event.preventDefault();
        void search(1, taskId);
      }}>
        <label>
          Task ID
          <input
            type="number"
            min="1"
            step="1"
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
            placeholder="e.g. 1"
          />
        </label>
        <label className="disabled-field">
          Device
          <select disabled aria-label="Device filter unavailable">
            <option>Not supported by the API</option>
          </select>
        </label>
        <button className="button" type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      {page?.items.length ? (
        <>
          <div className="cards">
            {page.items.map((alternative) => (
              <AlternativeCard
                key={alternative.id}
                item={alternative}
                onSelect={() => setSelectedAlternative(alternative)}
              />
            ))}
          </div>
          <Pagination
            page={pageNumber}
            total={page.total}
            pageSize={page.pageSize}
            onChange={(value) => void search(value, taskId)}
          />
        </>
      ) : (
        <div className="empty">
          <strong>{loading ? "Loading alternatives…" : "No approved alternatives found"}</strong>
          {!loading && <p>Try another task ID or remove the filter.</p>}
        </div>
      )}
    </section>
  );
}

function SubmissionsView({ onError }: { onError: (message: string) => void }) {
  const [page, setPage] = useState<AlternativePage | null>(null);
  const [rejected, setRejected] = useState<AlternativePage | null>(null);
  const [approved, setApproved] = useState<AlternativePage | null>(null);
  const [taskId, setTaskId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [approvedPageNumber, setApprovedPageNumber] = useState(1);

  const refresh = useCallback(async (nextPage: number) => {
    try {
      const [pendingPage, rejectedPage] = await Promise.all([
        listAlternatives({ page: nextPage, status: "pending", mine: true }),
        listAlternatives({ page: 1, status: "rejected", mine: true }),
      ]);
      setPage(pendingPage);
      setRejected(rejectedPage);
      setPageNumber(nextPage);
    } catch (error) {
      onError(errorMessage(error));
    }
  }, [onError]);

  const refreshApproved = useCallback(async (nextPage: number) => {
    try {
      setApproved(await listAlternatives({ page: nextPage, status: "approved", mine: true }));
      setApprovedPageNumber(nextPage);
    } catch (error) {
      onError(errorMessage(error));
    }
  }, [onError]);

  useEffect(() => {
    void refresh(1);
    void refreshApproved(1);
  }, [refresh, refreshApproved]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const id = Number(taskId);
    if (!Number.isInteger(id) || id < 1) {
      onError("Task ID must be a positive integer.");
      return;
    }
    setLoading(true);
    onError("");
    try {
      if (editing === null) {
        await createAlternative({ taskId: id, name, description });
      } else {
        await updateAlternative(editing, { taskId: id, name, description });
      }
      setEditing(null);
      setTaskId("");
      setName("");
      setDescription("");
      await refresh(pageNumber);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function beginEdit(item: Alternative) {
    setEditing(item.id);
    setTaskId(String(item.taskId));
    setName(item.name);
    setDescription(item.description);
  }

  async function remove(id: number) {
    if (!window.confirm("Supprimer cette proposition en attente ?")) return;
    try {
      await deleteAlternative(id);
      await refresh(pageNumber);
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR ACCOUNT</p>
          <h2>{editing === null ? "Submit a software alternative" : "Edit my submission"}</h2>
        </div>
        <span className="pill">Pending moderation</span>
      </div>
      <form className="submission-form" onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <label>
            Task ID *
            <input type="number" min="1" step="1" required value={taskId}
              onChange={(event) => setTaskId(event.target.value)} />
          </label>
          <label className="disabled-field">
            Device
            <input disabled placeholder="Not supported by the API" />
          </label>
        </div>
        <label>
          Software name *
          <input required maxLength={150} value={name}
            onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Description *
          <textarea required maxLength={5000} rows={4} value={description}
            onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="form-actions">
          <button className="button" type="submit" disabled={loading}>
            {loading ? "Saving…" : editing === null ? "Submit for moderation" : "Save changes"}
          </button>
          {editing !== null && (
            <button className="button secondary" type="button" onClick={() => {
              setEditing(null);
              setTaskId("");
              setName("");
              setDescription("");
            }}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="list-heading">
        <h3>My pending submissions</h3>
        <button className="text-button" onClick={() => void refresh(pageNumber)}>Refresh</button>
      </div>
      {page?.items.length ? (
        <div className="cards">
          {page.items.map((item) => (
            <article className="alternative-card" key={item.id}>
              <div className="card-title-row">
                <h3>{item.name}</h3>
                <span className="status pending">Pending</span>
              </div>
              <p>{item.description}</p>
              <small>Task #{item.taskId}</small>
              <div className="form-actions">
                <button className="button secondary" onClick={() => beginEdit(item)}>Edit</button>
                <button className="button danger" onClick={() => void remove(item.id)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty"><strong>No pending submissions</strong></div>}
      {page && <Pagination
        page={pageNumber}
        total={page.total}
        pageSize={page.pageSize}
        onChange={(value) => void refresh(value)}
      />}

      <div className="list-heading">
        <h3>My approved alternatives</h3>
        <button className="text-button" onClick={() => void refreshApproved(approvedPageNumber)}>Refresh</button>
      </div>
      {approved?.items.length ? (
        <>
          <div className="cards">
            {approved.items.map((item) => (
              <article className="alternative-card" key={item.id}>
                <div className="card-title-row">
                  <h3>{item.name}</h3>
                  <span className="status approved">Approved</span>
                </div>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
          <Pagination
            page={approvedPageNumber}
            total={approved.total}
            pageSize={approved.pageSize}
            onChange={(value) => void refreshApproved(value)}
          />
        </>
      ) : (
        <div className="empty compact">
          <strong>{approved ? "No approved alternatives yet" : "Loading approved alternatives…"}</strong>
        </div>
      )}

      <div className="list-heading">
        <h3>Rejected submissions</h3>
      </div>
      {rejected?.items.length ? (
        <div className="cards">
          {rejected.items.map((item) => (
            <article className="alternative-card" key={item.id}>
              <div className="card-title-row">
                <h3>{item.name}</h3>
                <span className="status rejected">Rejected</span>
              </div>
              <p>{item.description}</p>
              <small>Task #{item.taskId}</small>
              <div className="rejection-reason">
                <strong>Rejection reason</strong>
                <p>{item.moderationReason || "No reason provided."}</p>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty compact"><strong>No rejected submissions</strong></div>}
    </section>
  );
}

function ModerationView({ onError }: { onError: (message: string) => void }) {
  const [page, setPage] = useState<AlternativePage | null>(null);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [pageNumber, setPageNumber] = useState(1);

  const refresh = useCallback(async (nextPage: number) => {
    try {
      setPage(await listAlternatives({ page: nextPage, status: "pending" }));
      setPageNumber(nextPage);
    } catch (error) {
      onError(errorMessage(error));
    }
  }, [onError]);

  useEffect(() => { void refresh(1); }, [refresh]);

  async function decide(item: Alternative, status: "approved" | "rejected") {
    const reason = reasons[item.id]?.trim() ?? "";
    if (status === "rejected" && !reason) {
      onError("Enter a reason to reject this submission.");
      return;
    }
    try {
      await updateAlternative(item.id, {
        status,
        moderationReason: status === "rejected" ? reason : null,
      });
      onError("");
      await refresh(pageNumber);
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h2>Review submissions</h2>
        </div>
        <span className="pill">{page?.total ?? 0} pending</span>
      </div>
      <p className="muted">Task, device, and compatibility moderation is not available in the API yet.</p>
      {page?.items.length ? (
        <div className="cards">
          {page.items.map((item) => (
            <article className="alternative-card" key={item.id}>
              <div className="card-title-row">
                <h3>{item.name}</h3>
                <span className="status pending">Pending</span>
              </div>
              <p>{item.description}</p>
              <small>Task #{item.taskId} · Submitted by user #{item.submittedBy}</small>
              <label>
                Rejection reason
                <textarea rows={2} maxLength={1000} value={reasons[item.id] ?? ""}
                  onChange={(event) => setReasons({ ...reasons, [item.id]: event.target.value })} />
              </label>
              <div className="form-actions">
                <button className="button" onClick={() => void decide(item, "approved")}>Approve</button>
                <button className="button danger" onClick={() => void decide(item, "rejected")}>Reject</button>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty"><strong>No submissions to review</strong></div>}
      {page && <Pagination
        page={pageNumber}
        total={page.total}
        pageSize={page.pageSize}
        onChange={(value) => void refresh(value)}
      />}
    </section>
  );
}

function ApprovedAlternativesView({ onError }: { onError: (message: string) => void }) {
  const [page, setPage] = useState<AlternativePage | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const refresh = useCallback(async (nextPage: number) => {
    try {
      setPage(await listAlternatives({ page: nextPage, status: "approved" }));
      setPageNumber(nextPage);
      onError("");
    } catch (error) {
      onError(errorMessage(error));
    }
  }, [onError]);

  useEffect(() => { void refresh(1); }, [refresh]);

  async function remove(item: Alternative) {
    if (!window.confirm(`Delete approved alternative "${item.name}"?`)) return;
    setDeletingId(item.id);
    try {
      await deleteAlternative(item.id);
      onError("");
      const nextPage = pageNumber > 1 && page?.items.length === 1
        ? pageNumber - 1
        : pageNumber;
      await refresh(nextPage);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h2>Approved alternatives</h2>
        </div>
        <button className="text-button" onClick={() => void refresh(pageNumber)}>Refresh</button>
      </div>
      {page?.items.length ? (
        <>
          <div className="cards">
            {page.items.map((item) => (
              <article className="alternative-card" key={item.id}>
                <div className="card-title-row">
                  <h3>{item.name}</h3>
                  <span className="status approved">Approved</span>
                </div>
                <p>{item.description}</p>
                <button
                  className="button danger"
                  disabled={deletingId !== null}
                  onClick={() => void remove(item)}
                >
                  {deletingId === item.id ? "Deleting…" : "Delete approved alternative"}
                </button>
              </article>
            ))}
          </div>
          <Pagination
            page={pageNumber}
            total={page.total}
            pageSize={page.pageSize}
            onChange={(value) => void refresh(value)}
          />
        </>
      ) : (
        <div className="empty">
          <strong>{page ? "No approved alternatives" : "Loading approved alternatives…"}</strong>
        </div>
      )}
    </section>
  );
}

function UsersView({ onError }: { onError: (message: string) => void }) {
  const [page, setPage] = useState<UserPage | null>(null);
  const [pageNumber, setPageNumber] = useState(1);

  const refresh = useCallback(async (nextPage: number) => {
    try {
      setPage(await listUsers(nextPage));
      setPageNumber(nextPage);
      onError("");
    } catch (error) {
      onError(errorMessage(error));
    }
  }, [onError]);

  useEffect(() => { void refresh(1); }, [refresh]);

  async function changeRole(user: User, role: "user" | "admin") {
    try {
      await updateUserRole(user.id, role);
      await refresh(pageNumber);
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h2>Users and roles</h2>
        </div>
        <span className="pill">{page?.total ?? 0} users</span>
      </div>
      <div className="user-list">
        {page?.items.map((user) => (
          <div className="user-row" key={user.id}>
            <div>
              <strong>{user.email}</strong>
              <small>Account #{user.id}</small>
            </div>
            <select
              aria-label={`Role for ${user.email}`}
              value={user.role}
              onChange={(event) => {
                const role = event.target.value;
                if (role === "user" || role === "admin") void changeRole(user, role);
              }}
            >
              <option value="user">User</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
        ))}
      </div>
      {page && <Pagination
        page={pageNumber}
        total={page.total}
        pageSize={page.pageSize}
        onChange={(value) => void refresh(value)}
      />}
    </section>
  );
}

function AlternativeCard({ item, onSelect }: {
  item: Alternative;
  onSelect: () => void;
}) {
  return (
    <article className="alternative-card">
      <div className="card-title-row">
        <h3>
          <button className="alternative-link" type="button" onClick={onSelect}>
            {item.name}
          </button>
        </h3>
      </div>
      <p>{item.description}</p>
    </article>
  );
}

function AlternativeDetails({ item, onBack, onNavigateToTask }: {
  item: Alternative;
  onBack: () => void;
  onNavigateToTask: (id: number) => void;
}) {
  return (
    <section className="panel">
      <button className="text-button detail-back" type="button" onClick={onBack}>
        ← Back to alternatives
      </button>
      <div className="section-heading detail-heading">
        <div>
          <p className="eyebrow">SOFTWARE ALTERNATIVE</p>
          <h2>{item.name}</h2>
        </div>
      </div>
      <p className="detail-description">{item.description}</p>
      <DetailSection title="Proposal" fields={[
        { label: "Proposed on", value: formatDetailDate(item.createdAt) },
        { label: "Approval date", value: notProvided },
        { label: "Proposed by", value: notProvided },
      ]} />
      <section className="detail-section">
        <h3>Task</h3>
        <dl className="detail-fields">
          <div>
            <dt>Task name</dt>
            <dd>
              <a
                className="task-link"
                href={`/tasks/${item.taskId}`}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                    return;
                  }
                  event.preventDefault();
                  onNavigateToTask(item.taskId);
                }}
              >
                {notProvided}
              </a>
            </dd>
          </div>
        </dl>
      </section>
      <DetailSection title="Compatibility" fields={[
        { label: "Device", value: notProvided },
        { label: "Operating system", value: notProvided },
        { label: "Memory (MB)", value: notProvided },
        { label: "Compatibility status", value: notProvided },
        { label: "Limitations", value: notProvided },
      ]} />
      <DetailSection title="Ratings" fields={[
        { label: "Score (1–5)", value: notProvided },
        { label: "Comment", value: notProvided },
      ]} />
    </section>
  );
}

function TaskDetailsPage({ onBack }: { onBack: () => void }) {
  return (
    <section className="panel">
      <button className="text-button detail-back" type="button" onClick={onBack}>
        ← Back to alternatives
      </button>
      <p className="eyebrow">TASK</p>
      <h2>Task details</h2>
      <p className="muted">Task information will appear here when it is available.</p>
    </section>
  );
}

const notProvided = "Not provided";

function formatDetailDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })
    .format(new Date(value));
}

function DetailSection({ title, fields }: {
  title: string;
  fields: Array<{ label: string; value: string }>;
}) {
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      <dl className="detail-fields">
        {fields.map((field) => (
          <div key={field.label}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Pagination(props: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(props.total / props.pageSize));
  return (
    <div className="pagination">
      <span>Page {props.page} sur {pages}</span>
      <div>
        <button className="button secondary" disabled={props.page <= 1}
          onClick={() => props.onChange(props.page - 1)}>Previous</button>
        <button className="button secondary" disabled={props.page >= pages}
          onClick={() => props.onChange(props.page + 1)}>Next</button>
      </div>
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

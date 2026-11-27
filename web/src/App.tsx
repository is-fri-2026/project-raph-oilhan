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
import { currentEmail, hasRole, isAuthenticated, logout } from "./auth";
import LoginPage from "./LoginPage";

type View = "search" | "submissions" | "moderation" | "users";

const unavailable = [
  "Free-text search",
  "Device filter",
  "Compatibility details",
  "Registration",
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
  const [showLogin, setShowLogin] = useState(false);

  /** Called by LoginPage once credentials are validated. */
  function handleLoginSuccess() {
    setAuthenticated(true);
    setAdmin(hasRole("admin"));
    setShowLogin(false);
  }

  /** Called when the user clicks "Sign in" in the topbar. */
  function openLogin() {
    setShowLogin(true);
  }

  async function handleLogout() {
    await logout();
    setAuthenticated(false);
    setAdmin(false);
    setView("search");
  }

  // Show the login overlay when requested (and user is not already authenticated)
  if (showLogin && !isAuthenticated()) {
    return <LoginPage onSuccess={handleLoginSuccess} />;
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
              <button className="button" onClick={openLogin}>Sign in</button>
              <button className="button disabled" disabled title="Self-registration is disabled.">
                Sign up
              </button>
            </>
          )}
        </div>
      </header>

      <nav className="navigation" aria-label="Main navigation">
        <NavButton active={view === "search"} onClick={() => setView("search")}>Search</NavButton>
        <NavButton
          active={view === "submissions"}
          disabled={!authenticated}
          title={!authenticated ? "Sign in to access your submissions." : undefined}
          onClick={() => setView("submissions")}
        >
          My submissions
        </NavButton>
        <NavButton
          active={view === "moderation"}
          disabled={!admin}
          title={!admin ? "Administrators only." : undefined}
          onClick={() => setView("moderation")}
        >
          Moderation
        </NavButton>
        <NavButton
          active={view === "users"}
          disabled={!admin}
          title={!admin ? "Administrators only." : undefined}
          onClick={() => setView("users")}
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

      {view === "search" && <SearchView onError={setMessage} />}
      {view === "submissions" && authenticated && <SubmissionsView onError={setMessage} />}
      {view === "moderation" && admin && <ModerationView onError={setMessage} />}
      {view === "users" && admin && <UsersView onError={setMessage} />}

      <footer>
        <span>Available features reflect the current API contract.</span>
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

function SearchView({ onError }: { onError: (message: string) => void }) {
  const [taskId, setTaskId] = useState("");
  const [page, setPage] = useState<AlternativePage | null>(null);
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
            {page.items.map((alternative) => <AlternativeCard key={alternative.id} item={alternative} />)}
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
  const [taskId, setTaskId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);

  const refresh = useCallback(async (nextPage: number) => {
    try {
      const [pendingPage, rejectedPage] = await Promise.all([
        listAlternatives({ page: nextPage, status: "pending" }),
        listAlternatives({ page: 1, status: "rejected" }),
      ]);
      setPage(pendingPage);
      setRejected(rejectedPage);
      setPageNumber(nextPage);
    } catch (error) {
      onError(errorMessage(error));
    }
  }, [onError]);

  useEffect(() => { void refresh(1); }, [refresh]);

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

function AlternativeCard({ item }: { item: Alternative }) {
  return (
    <article className="alternative-card">
      <div className="card-title-row">
        <h3>{item.name}</h3>
        <span className="status approved">Approved</span>
      </div>
      <p>{item.description}</p>
      <small>Task #{item.taskId}</small>
      <div className="disabled-feature" aria-disabled="true">
        Compatibility details and ratings are not available in the API yet.
      </div>
    </article>
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

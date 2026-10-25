'use client';

/**
 * The accounts screen: one page of people, and the one you picked beside it.
 *
 * Three verbs, and no fourth: create an account, change what it is, and give it a
 * temporary password. There is no Delete — a departing employee's name has to keep
 * appearing in `audit_log`, and the API answers the same way.
 *
 * The server page hands the first page already drawn, so the list is real on the first
 * paint. Filters re-read from `/api/console/users`, and the URL is the state, as on every
 * other list: `replaceState`, never `pushState`.
 *
 * A row is not editable by everyone who can read it. Admin holds `* read` and lands here
 * without `user.update`; the fields then render as text and the one button the account
 * needs is the password reset the screen does not offer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { consoleCall, consoleRead } from './client-api';
import { Button } from '@/components/console/kit';
import { Field, Input, Select } from '@/components/console/kit';
import { Alert, Badge, Empty, Note, Skeleton, type Tone } from '@/components/console/kit';
import { Card, RowAction, RowTitle } from '@/components/console/kit';
import type { MessageKey } from '@/lib/console/messages';
import type { ConsoleLocale } from '@/lib/console/prefs';
import type { RoleView, UserStatus, UsersScreenData, UsersView } from '@/lib/users/view';

type Labels = Record<MessageKey, string>;

interface Notice {
  tone: Tone;
  text: string;
}

const STATUS_KEY: Record<UserStatus, MessageKey> = {
  active: 'users.status.active',
  invited: 'users.status.invited',
  disabled: 'users.status.disabled',
};

const STATUS_TONE: Record<UserStatus, Tone> = {
  active: 'ok',
  invited: 'warn',
  disabled: 'danger',
};

const PER_PAGES = [25, 50, 100];

function queryOf(view: UsersView): string {
  const params = new URLSearchParams();
  if (view.q) params.set('q', view.q);
  if (view.status !== 'all') params.set('status', view.status);
  if (view.roleId) params.set('role', view.roleId);
  if (view.page > 1) params.set('page', String(view.page));
  if (view.per !== 25) params.set('per', String(view.per));
  const line = params.toString();
  return line ? `?${line}` : '';
}

function stamp(iso: string | null): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : '';
}

/** The one place a server code becomes a sentence. Unknown codes get the generic line. */
function errorText(code: string | null, labels: Labels): string {
  switch (code) {
    case 'self_locked':
      return labels['users.self_locked'];
    case 'last_owner':
      return labels['users.last_owner'];
    case 'email_taken':
      return labels['users.error.email_taken'];
    case 'unknown_role':
      return labels['users.error.unknown_role'];
    case 'weak_password':
      return labels['users.error.weak_password'];
    case 'invalid_input':
      return labels['users.error.invalid_input'];
    case 'forbidden':
      return labels['users.error.forbidden'];
    default:
      return labels['users.failed'];
  }
}

interface EditDraft {
  name: string;
  locale: string;
  roleId: string;
  status: 'active' | 'disabled';
}

interface CreateDraft {
  email: string;
  name: string;
  password: string;
  locale: string;
  roleId: string;
}

function createDraftOf(roles: RoleView[]): CreateDraft {
  return {
    email: '',
    name: '',
    password: '',
    locale: 'ar',
    roleId: roles.find((role) => role.name === 'Viewer')?.id ?? roles[0]?.id ?? '',
  };
}

export function UsersScreen({
  initial,
  labels,
  locale,
  canWrite,
  canCreate,
}: Readonly<{
  initial: UsersScreenData;
  labels: Labels;
  locale: ConsoleLocale;
  canWrite: boolean;
  canCreate: boolean;
}>) {
  const [view, setView] = useState<UsersView>(initial.view);
  const [users, setUsers] = useState(initial.users);
  const [roles, setRoles] = useState<RoleView[]>(initial.roles);
  const [list, setList] = useState({ total: initial.total, page: initial.page, pages: initial.pages });
  const [term, setTerm] = useState(initial.view.q);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initial.users[0]?.id ?? null);
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [create, setCreate] = useState<CreateDraft | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const ArrowBack = locale === 'ar' ? ChevronRight : ChevronLeft;
  const ArrowForward = locale === 'ar' ? ChevronLeft : ChevronRight;

  const selected = users.find((user) => user.id === selectedId) ?? null;

  const load = useCallback(async (next: UsersView): Promise<void> => {
    setLoading(true);
    setFailed(false);
    const result = await consoleRead<UsersScreenData>(`/api/console/users${queryOf(next)}`);
    setLoading(false);
    if (!result.data?.users) {
      setFailed(true);
      return;
    }
    setUsers(result.data.users);
    if (result.data.roles) setRoles(result.data.roles);
    setList({ total: result.data.total, page: result.data.page, pages: result.data.pages });
    setSelectedId((current) => (current && result.data?.users.some((user) => user.id === current) ? current : null));
  }, []);

  const signature = JSON.stringify(view);
  const drawn = useRef(signature);
  useEffect(() => {
    if (drawn.current === signature) return;
    drawn.current = signature;
    window.history.replaceState(null, '', `/console/users${queryOf(view)}`);
    void load(view);
  }, [signature, view, load]);

  useEffect(() => {
    if (term.trim() === view.q) return;
    const timer = setTimeout(() => setView((current) => ({ ...current, q: term.trim(), page: 1 })), 350);
    return () => clearTimeout(timer);
  }, [term, view.q]);

  const merge = useCallback((user: UsersScreenData['users'][number]): void => {
    setUsers((current) => current.map((row) => (row.id === user.id ? user : row)));
  }, []);

  function pick(id: string): void {
    if (id === selectedId) {
      setSelectedId(null);
      setEdit(null);
      return;
    }
    setSelectedId(id);
    setEdit(null);
    setPassword('');
    setNotice(null);
  }

  const editing = selected && edit ? edit : selected ? {
    name: selected.name,
    locale: selected.locale,
    roleId: selected.roles[0]?.id ?? '',
    status: (selected.status === 'disabled' ? 'disabled' : 'active') as 'active' | 'disabled',
  } : null;

  function patchEdit(patch: Partial<EditDraft>): void {
    setEdit((current) => ({ ...(current ?? (editing as EditDraft)), ...patch }));
  }

  async function saveUser(): Promise<void> {
    if (!selected || !editing) return;
    setBusy('save');
    const result = await consoleCall<{ user?: UsersScreenData['users'][number] }>(
      `/api/console/users/${selected.id}`,
      'PATCH',
      {
        name: editing.name,
        locale: editing.locale,
        ...(editing.roleId && editing.roleId !== selected.roles[0]?.id ? { roleId: editing.roleId } : {}),
        ...(editing.status !== (selected.status === 'disabled' ? 'disabled' : 'active') ? { status: editing.status } : {}),
      },
    );
    setBusy(null);
    if (!result.data?.user) {
      setNotice({ tone: 'danger', text: errorText(result.error, labels) });
      return;
    }
    merge(result.data.user);
    setEdit(null);
    setNotice({ tone: 'ok', text: labels['users.saved'] });
    void load(view);
  }

  async function resetPassword(): Promise<void> {
    if (!selected || !password) return;
    setBusy('password');
    const result = await consoleCall<{ user?: UsersScreenData['users'][number] }>(
      `/api/console/users/${selected.id}/password`,
      'POST',
      { password, mustChangePassword: selected.id !== initial.currentUserId },
    );
    setBusy(null);
    if (!result.data?.user) {
      setNotice({ tone: 'danger', text: errorText(result.error, labels) });
      return;
    }
    merge(result.data.user);
    setPassword('');
    setNotice({ tone: 'ok', text: labels['users.password_saved'] });
  }

  async function createUser(): Promise<void> {
    if (!create) return;
    setBusy('create');
    const result = await consoleCall<{ user?: UsersScreenData['users'][number] }>('/api/console/users', 'POST', {
      email: create.email,
      name: create.name || undefined,
      password: create.password,
      locale: create.locale,
      roleId: create.roleId,
      mustChangePassword: true,
    });
    setBusy(null);
    if (!result.data?.user) {
      setNotice({ tone: 'danger', text: errorText(result.error, labels) });
      return;
    }
    setUsers((current) => [result.data?.user as UsersScreenData['users'][number], ...current]);
    setList((current) => ({ ...current, total: current.total + 1 }));
    setSelectedId(result.data.user.id);
    setCreate(null);
    setNotice({ tone: 'ok', text: labels['users.created'] });
  }

  const roleName = (role: RoleView): string => role.name;

  return (
    <div className="console-users">
      <p className="console-lede">{labels['users.intro']}</p>

      <div className="console-list-bar">
        <Input
          bar
          className="console-search"
          type="search"
          value={term}
          placeholder={labels['users.search']}
          aria-label={labels['users.search']}
          onChange={(event) => setTerm(event.target.value)}
        />
        <label className="console-inline">
          {labels['users.field.status']}
          <Select
            bar
            value={view.status}
            onChange={(event) =>
              setView((current) => ({ ...current, status: event.target.value as UsersView['status'], page: 1 }))
            }
          >
            <option value="all">{labels['users.filter.all']}</option>
            <option value="active">{labels['users.status.active']}</option>
            <option value="invited">{labels['users.status.invited']}</option>
            <option value="disabled">{labels['users.status.disabled']}</option>
          </Select>
        </label>
        <label className="console-inline">
          {labels['users.field.role']}
          <Select
            bar
            value={view.roleId}
            onChange={(event) => setView((current) => ({ ...current, roleId: event.target.value, page: 1 }))}
          >
            <option value="">{labels['roles.all']}</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {roleName(role)}
              </option>
            ))}
          </Select>
        </label>
        <label className="console-inline">
          {labels['users.per_page']}
          <Select
            bar
            value={String(view.per)}
            onChange={(event) => setView((current) => ({ ...current, per: Number(event.target.value) || 25, page: 1 }))}
          >
            {PER_PAGES.map((size) => (
              <option key={size} value={String(size)}>
                {size}
              </option>
            ))}
          </Select>
        </label>
        {canCreate && (
          <Button variant="primary" onClick={() => setCreate(create ?? createDraftOf(roles))}>
            {labels['users.add']}
          </Button>
        )}
      </div>

      {create && (
        <Card>
          <form
            className="console-user-form"
            onSubmit={(event) => {
              event.preventDefault();
              void createUser();
            }}
          >
            <h2 className="console-subheading">{labels['users.add']}</h2>
            <div className="console-user-grid">
              <Field label={labels['users.field.email']} htmlFor="user-new-email">
                <Input
                  id="user-new-email"
                  type="email"
                  bar
                  required
                  autoComplete="off"
                  value={create.email}
                  onChange={(event) => setCreate({ ...create, email: event.target.value })}
                />
              </Field>
              <Field label={labels['users.field.name']} htmlFor="user-new-name">
                <Input
                  id="user-new-name"
                  bar
                  value={create.name}
                  onChange={(event) => setCreate({ ...create, name: event.target.value })}
                />
              </Field>
              <Field label={labels['users.field.role']} htmlFor="user-new-role">
                <Select
                  id="user-new-role"
                  bar
                  value={create.roleId}
                  onChange={(event) => setCreate({ ...create, roleId: event.target.value })}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {roleName(role)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={labels['users.field.locale']} htmlFor="user-new-locale">
                <Select
                  id="user-new-locale"
                  bar
                  value={create.locale}
                  onChange={(event) => setCreate({ ...create, locale: event.target.value })}
                >
                  <option value="ar">{labels['content.locale.ar']}</option>
                  <option value="en">{labels['content.locale.en']}</option>
                </Select>
              </Field>
              <Field label={labels['users.field.password']} htmlFor="user-new-password" note={<Note>{labels['users.password_hint']}</Note>}>
                <Input
                  id="user-new-password"
                  type="password"
                  bar
                  required
                  minLength={12}
                  autoComplete="new-password"
                  value={create.password}
                  onChange={(event) => setCreate({ ...create, password: event.target.value })}
                />
              </Field>
            </div>
            <Note>{labels['users.must_change']}</Note>
            <div className="console-controls">
              <Button type="submit" variant="primary" loading={busy === 'create'} disabled={!create.password}>
                {labels['users.create']}
              </Button>
              <Button onClick={() => setCreate(null)}>{labels['users.cancel']}</Button>
            </div>
          </form>
        </Card>
      )}

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div className="console-users-split">
        <div className="console-users-list" aria-busy={loading}>
          {failed ? (
            <Alert tone="danger">
              {labels['content.load_failed']}
              <Button onClick={() => void load(view)}>{labels['users.retry']}</Button>
            </Alert>
          ) : loading && users.length === 0 ? (
            <Skeleton rows={Math.min(view.per, 6)} label={labels['content.loading']} />
          ) : users.length === 0 ? (
            <Empty>{labels['users.empty']}</Empty>
          ) : (
            <Card flat flush className="console-table-wrap">
              <table className="console-table">
                <thead>
                  <tr>
                    <th>{labels['users.field.name']}</th>
                    <th className="console-cell-extra">{labels['users.field.email']}</th>
                    <th>{labels['users.field.role']}</th>
                    <th>{labels['users.field.status']}</th>
                    <th className="console-cell-extra">{labels['users.field.last_login']}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} data-active={user.id === selectedId || undefined}>
                      <td>
                        <RowAction
                          aria-expanded={user.id === selectedId}
                          aria-controls="user-editor"
                          onClick={() => pick(user.id)}
                        >
                          <RowTitle>{user.name || user.email}</RowTitle>
                        </RowAction>
                        {user.id === initial.currentUserId && <Badge tone="ok">{labels['users.you']}</Badge>}
                      </td>
                      <td className="console-cell-extra">{user.email}</td>
                      <td>
                        <span className="console-badges">
                          {user.roles.length === 0
                            ? <Badge tone="warn">{labels['users.field.role']}</Badge>
                            : user.roles.map((role) => (
                                <Badge key={role.id} tone={role.isOwner ? 'ok' : 'neutral'}>
                                  {role.name}
                                </Badge>
                              ))}
                        </span>
                      </td>
                      <td>
                        <Badge tone={STATUS_TONE[user.status]}>{labels[STATUS_KEY[user.status]]}</Badge>
                      </td>
                      <td className="console-cell-extra">
                        {user.lastLoginAt ? <time dateTime={user.lastLoginAt}>{stamp(user.lastLoginAt)}</time> : labels['users.never']}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <div className="console-pager">
            <Note className="console-count">
              {list.total} {labels['users.total']}
            </Note>
            {list.pages > 1 && (
              <span className="console-controls">
                <Button
                  disabled={list.page <= 1}
                  leading={<ArrowBack size={16} aria-hidden="true" />}
                  onClick={() => setView((current) => ({ ...current, page: list.page - 1 }))}
                >
                  {labels['users.page.prev']}
                </Button>
                <Note>
                  {labels['users.page']} {list.page} {labels['users.page.of']} {list.pages}
                </Note>
                <Button
                  disabled={list.page >= list.pages}
                  trailing={<ArrowForward size={16} aria-hidden="true" />}
                  onClick={() => setView((current) => ({ ...current, page: list.page + 1 }))}
                >
                  {labels['users.page.next']}
                </Button>
              </span>
            )}
          </div>
        </div>

        <Card id="user-editor" className="console-user-detail" aria-label={labels['users.heading']}>
          {!selected || !editing ? (
            <Empty>{labels['users.detail.none']}</Empty>
          ) : (
            <>
              <h2 className="console-lead-title">{selected.name || selected.email}</h2>
              <Note>{selected.email}</Note>
              <div className="console-badges">
                <Badge tone={STATUS_TONE[selected.status]}>{labels[STATUS_KEY[selected.status]]}</Badge>
                {selected.mustChangePassword && <Badge tone="warn">{labels['users.temporary']}</Badge>}
                {selected.id === initial.currentUserId && <Badge tone="ok">{labels['users.you']}</Badge>}
              </div>

              {canWrite ? (
                <form
                  className="console-user-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveUser();
                  }}
                >
                  <Field label={labels['users.field.name']} htmlFor="user-edit-name">
                    <Input
                      id="user-edit-name"
                      bar
                      value={editing.name}
                      onChange={(event) => patchEdit({ name: event.target.value })}
                    />
                  </Field>
                  <Field label={labels['users.field.role']} htmlFor="user-edit-role">
                    <Select
                      id="user-edit-role"
                      bar
                      disabled={selected.id === initial.currentUserId}
                      value={editing.roleId}
                      onChange={(event) => patchEdit({ roleId: event.target.value })}
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {roleName(role)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={labels['users.field.locale']} htmlFor="user-edit-locale">
                    <Select
                      id="user-edit-locale"
                      bar
                      value={editing.locale}
                      onChange={(event) => patchEdit({ locale: event.target.value })}
                    >
                      <option value="ar">{labels['content.locale.ar']}</option>
                      <option value="en">{labels['content.locale.en']}</option>
                    </Select>
                  </Field>
                  <Field label={labels['users.field.status']} htmlFor="user-edit-status">
                    <Select
                      id="user-edit-status"
                      bar
                      disabled={selected.id === initial.currentUserId}
                      value={editing.status}
                      onChange={(event) => patchEdit({ status: event.target.value as 'active' | 'disabled' })}
                    >
                      <option value="active">{labels['users.status.active']}</option>
                      <option value="disabled">{labels['users.status.disabled']}</option>
                    </Select>
                  </Field>
                  {selected.id === initial.currentUserId && <Note>{labels['users.self_locked']}</Note>}
                  <Button type="submit" variant="primary" loading={busy === 'save'}>
                    {labels['users.save']}
                  </Button>
                </form>
              ) : (
                <>
                  <Note>{labels['users.readonly']}</Note>
                  <dl className="console-lead-meta">
                    <dt>{labels['users.field.role']}</dt>
                    <dd>{selected.roles.map((role) => role.name).join(' · ') || '—'}</dd>
                    <dt>{labels['users.field.locale']}</dt>
                    <dd>{selected.locale === 'en' ? labels['content.locale.en'] : labels['content.locale.ar']}</dd>
                    <dt>{labels['users.field.last_login']}</dt>
                    <dd>{selected.lastLoginAt ? stamp(selected.lastLoginAt) : labels['users.never']}</dd>
                    <dt>{labels['users.field.created']}</dt>
                    <dd>{stamp(selected.createdAt)}</dd>
                  </dl>
                </>
              )}

              {canWrite && (
                <form
                  className="console-user-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void resetPassword();
                  }}
                >
                  <h3 className="console-subheading">{labels['users.reset']}</h3>
                  <Field
                    label={labels['users.field.password']}
                    htmlFor="user-password"
                    note={<Note>{labels['users.password_hint']}</Note>}
                  >
                    <Input
                      id="user-password"
                      type="password"
                      bar
                      minLength={12}
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </Field>
                  <Button type="submit" loading={busy === 'password'} disabled={!password}>
                    {labels['users.reset_save']}
                  </Button>
                </form>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

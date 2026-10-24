'use client';

/**
 * Roles and permissions: the matrix a grant is actually made of.
 *
 * Two kinds of role share this screen, and the difference is not decoration:
 *
 *   - the six catalog roles (`is_system`) are owned by `ROLE_SEEDS` and `syncRoles()`.
 *     They render read-only, because an edit here would be reverted by the next deploy
 *     and the console would look like it had lost the change;
 *   - a custom role is an ordinary row, and the matrix edits the whole permission set at
 *     once — an unchecked box is a grant that disappears, not one that is ignored.
 *
 * The scope checkboxes are honest about a subtlety in `can()`: a scope narrows a
 * dimension only when it names it. So "All languages" is the *absence* of `locales`,
 * not a list of both; ticking a single language is what turns the dimension on.
 */
import { Fragment, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/Field';
import { Alert, Badge, Empty, Note, type Tone } from '@/components/ui/Status';
import { Card, RowAction, RowTitle } from '@/components/ui/Surface';
import type { MessageKey } from '@/lib/console/messages';
import type { ConsoleLocale } from '@/lib/console/prefs';
import type { Action, Resource } from '@/lib/auth/permissions';
import type { PermissionScope } from '@/lib/db/types';
import type { PermissionCatalog } from '@/lib/users/catalog';
import type { RoleView } from '@/lib/users/view';
import { consoleCall } from './client-api';

type Labels = Record<MessageKey, string>;

interface Notice {
  tone: Tone;
  text: string;
}

interface GrantDraft {
  resource: Resource;
  action: Action;
  scope: PermissionScope | null;
}

interface Draft {
  name: string;
  description: string;
  grants: Record<string, GrantDraft>;
}

function keyOf(resource: string, action: string): string {
  return `${resource}\u0000${action}`;
}

function draftOf(role: RoleView | null): Draft {
  const grants: Record<string, GrantDraft> = {};
  for (const grant of role?.permissions ?? []) {
    // The Owner's wildcard is not a matrix cell: it is the whole matrix.
    if (grant.resource === '*') continue;
    grants[keyOf(grant.resource, grant.action)] = {
      resource: grant.resource as Resource,
      action: grant.action as Action,
      scope: grant.scope,
    };
  }
  return { name: role?.name ?? '', description: role?.description ?? '', grants };
}

function errorText(code: string | null, labels: Labels): string {
  if (code?.startsWith('read_required:')) return labels['roles.error.read_required'];
  switch (code) {
    case 'system_role_immutable':
      return labels['roles.error.system_role_immutable'];
    case 'role_name_taken':
      return labels['roles.error.role_name_taken'];
    case 'role_in_use':
      return labels['roles.error.role_in_use'];
    case 'last_owner':
      return labels['roles.error.last_owner'];
    case 'invalid_input':
      return labels['roles.error.invalid_input'];
    case 'forbidden':
      return labels['roles.error.forbidden'];
    default:
      return labels['roles.failed'];
  }
}

export function RolesScreen({
  initial,
  catalog,
  labels,
  canWrite,
}: Readonly<{
  initial: { roles: RoleView[] };
  catalog: PermissionCatalog;
  labels: Labels;
  locale: ConsoleLocale;
  canWrite: boolean;
}>) {
  const [roles, setRoles] = useState<RoleView[]>(initial.roles);
  const [selectedId, setSelectedId] = useState<string | null>(initial.roles[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial.roles[0] ?? null));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const selected = roles.find((role) => role.id === selectedId) ?? null;
  // A catalog role is drawn but never touched: `syncRoles()` owns it.
  const editable = canWrite && (creating || (Boolean(selected) && !selected?.isSystem));
  const fullAccess = Boolean(selected?.permissions.some((grant) => grant.resource === '*'));

  function pick(role: RoleView): void {
    setSelectedId(role.id);
    setCreating(false);
    setDraft(draftOf(role));
    setConfirming(false);
    setNotice(null);
  }

  function startCreate(): void {
    setSelectedId(null);
    setCreating(true);
    setDraft(draftOf(null));
    setConfirming(false);
    setNotice(null);
  }

  function toggle(resource: Resource, action: Action): void {
    if (!editable) return;
    const key = keyOf(resource, action);
    setDraft((current) => {
      const grants = { ...current.grants };
      if (grants[key]) delete grants[key];
      else grants[key] = { resource, action, scope: null };
      return { ...current, grants };
    });
  }

  function scopeOf(grant: GrantDraft, dimension: 'locales' | 'lists'): string[] | null {
    return grant.scope?.[dimension] ?? null;
  }

  function setScopeDimension(grant: GrantDraft, dimension: 'locales' | 'lists', values: string[] | null): void {
    const key = keyOf(grant.resource, grant.action);
    setDraft((current) => {
      const grants = { ...current.grants };
      const existing = grants[key];
      if (!existing) return current;
      const scope: PermissionScope = { ...(existing.scope ?? {}) };
      if (values === null || values.length === 0) delete scope[dimension];
      else scope[dimension] = values;
      grants[key] = { ...existing, scope: Object.keys(scope).length > 0 ? scope : null };
      return { ...current, grants };
    });
  }

  function toggleScopeValue(grant: GrantDraft, dimension: 'locales' | 'lists', value: string, all: string[]): void {
    const current = scopeOf(grant, dimension);
    if (current === null) {
      // "All" is the absence of the dimension; picking one value narrows it to that value.
      setScopeDimension(grant, dimension, [value]);
      return;
    }
    const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
    // A dimension that names every value says the same thing as no dimension at all.
    setScopeDimension(grant, dimension, next.length >= all.length ? null : next);
  }

  async function save(): Promise<void> {
    if (!editable) return;
    const grants = Object.values(draft.grants);
    setBusy('save');
    const result = creating
      ? await consoleCall<{ role?: RoleView }>('/api/console/roles', 'POST', {
          name: draft.name,
          description: draft.description,
          grants,
        })
      : await consoleCall<{ role?: RoleView }>(`/api/console/roles/${selectedId}`, 'PATCH', {
          name: draft.name,
          description: draft.description,
          grants,
        });
    setBusy(null);
    if (!result.data?.role) {
      setNotice({ tone: 'danger', text: errorText(result.error, labels) });
      return;
    }
    const role = result.data.role;
    setRoles((current) => {
      const exists = current.some((entry) => entry.id === role.id);
      return exists ? current.map((entry) => (entry.id === role.id ? role : entry)) : [...current, role];
    });
    setSelectedId(role.id);
    setCreating(false);
    setDraft(draftOf(role));
    setNotice({ tone: 'ok', text: creating ? labels['roles.created'] : labels['roles.saved'] });
  }

  async function remove(): Promise<void> {
    if (!selected || selected.isSystem) return;
    setBusy('delete');
    const result = await consoleCall<{ deleted?: string }>(`/api/console/roles/${selected.id}`, 'DELETE');
    setBusy(null);
    if (result.error) {
      setNotice({ tone: 'danger', text: errorText(result.error, labels) });
      return;
    }
    setRoles((current) => current.filter((role) => role.id !== selected.id));
    setSelectedId(null);
    setDraft(draftOf(null));
    setConfirming(false);
    setNotice({ tone: 'ok', text: labels['roles.deleted'] });
  }

  const checked = (resource: Resource, action: Action): boolean => Boolean(draft.grants[keyOf(resource, action)]);

  return (
    <div className="console-roles">
      <p className="ui-lede">{labels['roles.intro']}</p>

      <div className="console-list-bar">
        {canWrite && (
          <Button variant="primary" onClick={startCreate}>
            {labels['roles.new']}
          </Button>
        )}
        <Note>{labels['roles.matrix_hint']}</Note>
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div className="console-roles-split">
        <div className="console-roles-list">
          {roles.length === 0 ? (
            <Empty>{labels['roles.empty']}</Empty>
          ) : (
            <Card flat flush className="console-table-wrap">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>{labels['roles.name']}</th>
                    <th className="console-cell-extra">{labels['roles.members']}</th>
                    <th>{labels['roles.permissions']}</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id} data-active={role.id === selectedId || undefined}>
                      <td>
                        <RowAction aria-expanded={role.id === selectedId} aria-controls="role-editor" onClick={() => pick(role)}>
                          <RowTitle>{role.name}</RowTitle>
                        </RowAction>
                      </td>
                      <td className="console-cell-extra">{role.members}</td>
                      <td>
                        <span className="console-badges">
                          <Badge tone={role.isSystem ? 'neutral' : 'ok'}>
                            {role.isSystem ? labels['roles.system'] : labels['roles.custom']}
                          </Badge>
                          {role.isOwner && <Badge tone="ok">{labels['roles.owner']}</Badge>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <Card id="role-editor" className="console-role-detail" aria-label={labels['roles.permissions']}>
          {!selected && !creating ? (
            <Empty>{labels['roles.select']}</Empty>
          ) : (
            <form
              className="console-role-form"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="console-role-head">
                <h2 className="console-lead-title">
                  {creating ? labels['roles.new'] : (selected?.name ?? '')}
                </h2>
                {selected && (
                  <span className="console-badges">
                    <Badge tone={selected.isSystem ? 'neutral' : 'ok'}>
                      {selected.isSystem ? labels['roles.system'] : labels['roles.custom']}
                    </Badge>
                    <Badge>
                      {selected.members} {labels['roles.members']}
                    </Badge>
                  </span>
                )}
              </div>

              {selected?.isSystem && <Note>{labels['roles.locked']}</Note>}
              {!canWrite && <Note>{labels['roles.readonly']}</Note>}

              {(editable || creating) && (
                <div className="console-role-grid">
                  <Field label={labels['roles.name']} htmlFor="role-name" note={<Note>{labels['roles.name_hint']}</Note>}>
                    <Input
                      id="role-name"
                      bar
                      required
                      minLength={2}
                      maxLength={64}
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                  </Field>
                  <Field label={labels['roles.description']} htmlFor="role-description">
                    <Textarea
                      id="role-description"
                      rows={2}
                      maxLength={500}
                      value={draft.description}
                      onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    />
                  </Field>
                </div>
              )}

              {fullAccess ? (
                <Note tone="ok">{labels['roles.full_access']}</Note>
              ) : (
                <Card flat flush className="console-table-wrap">
                  <table className="ui-table console-role-table">
                    <thead>
                      <tr>
                        <th scope="col">{labels['roles.permissions']}</th>
                        {catalog.actions.map((action) => (
                          <th key={action.key} scope="col">
                            {action.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {catalog.groups.map((group) => (
                        <Fragment key={group.key}>
                          <tr className="console-role-group-row">
                            <th scope="colgroup" colSpan={catalog.actions.length + 1}>
                              {group.label}
                            </th>
                          </tr>
                          {group.resources.map((resource) => (
                            <tr key={resource.key}>
                              <th scope="row">{resource.label}</th>
                              {catalog.actions.map((action) => (
                                <td key={action.key}>
                                  <Checkbox
                                    aria-label={`${resource.label} · ${action.label}`}
                                    checked={checked(resource.key, action.key)}
                                    disabled={!editable}
                                    onChange={() => toggle(resource.key, action.key)}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}

              {!fullAccess && Object.values(draft.grants).some((grant) => grant.scope) && (
                <div className="console-role-scopes">
                  <h3 className="console-subheading">{labels['roles.scope']}</h3>
                  <Note>{labels['roles.scope.hint']}</Note>
                  {Object.values(draft.grants).map((grant) => {
                    if (!grant.scope) return null;
                    const resource = catalog.groups
                      .flatMap((group) => group.resources)
                      .find((entry) => entry.key === grant.resource);
                    const action = catalog.actions.find((entry) => entry.key === grant.action);
                    return (
                      <div key={keyOf(grant.resource, grant.action)} className="console-role-scope">
                        <strong>
                          {resource?.label ?? grant.resource} · {action?.label ?? grant.action}
                        </strong>
                        {catalog.scopes.map((scope) => {
                          const values = scopeOf(grant, scope.key);
                          const all = scope.options.map((option) => option.value);
                          return (
                            <fieldset key={scope.key} className="console-role-scope-field">
                              <legend>{scope.label}</legend>
                              <Checkbox
                                label={labels['roles.all']}
                                checked={values === null}
                                disabled={!editable}
                                onChange={() =>
                                  values === null
                                    ? setScopeDimension(grant, scope.key, [...all])
                                    : setScopeDimension(grant, scope.key, null)
                                }
                              />
                              {scope.options.map((option) => (
                                <Checkbox
                                  key={option.value}
                                  label={option.label}
                                  checked={values === null || values.includes(option.value)}
                                  disabled={!editable || values === null}
                                  onChange={() => toggleScopeValue(grant, scope.key, option.value, all)}
                                />
                              ))}
                            </fieldset>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {(editable || creating) && (
                <div className="console-controls">
                  <Button type="submit" variant="primary" loading={busy === 'save'} disabled={!draft.name.trim()}>
                    {creating ? labels['roles.create'] : labels['roles.save']}
                  </Button>
                  {creating && <Button onClick={() => setCreating(false)}>{labels['roles.cancel']}</Button>}
                  {selected && !selected.isSystem && selected.members === 0 && (
                    confirming ? (
                      <>
                        <Note tone="danger">{labels['roles.delete_confirm']}</Note>
                        <Button variant="danger" loading={busy === 'delete'} onClick={() => void remove()}>
                          {labels['roles.delete_yes']}
                        </Button>
                        <Button onClick={() => setConfirming(false)}>{labels['roles.delete_no']}</Button>
                      </>
                    ) : (
                      <Button variant="danger" onClick={() => setConfirming(true)}>
                        {labels['roles.delete']}
                      </Button>
                    )
                  )}
                </div>
              )}
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

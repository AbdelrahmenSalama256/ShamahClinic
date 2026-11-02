'use client';

/**
 * The one question an offer answers about services: which services it can be booked through.
 *
 * Three states, and the middle one is the reason the control exists. A legacy offer has
 * *never* been asked, and reading that as "All services" would silently widen every offer on
 * the site the moment booking started to restrict anything. So the column's NULL has its own
 * badge, its own words, and its own way back — and `[]` (nobody linked, deliberately) and
 * `["*"]` (everybody, deliberately) are reachable only by pressing something.
 *
 * The picker is a plain list of checkboxes with a search box above it, not a popup: a popup
 * hides what is already chosen, and the whole point of the relation is that an owner can see
 * which services an offer covers while looking at the offer. It stays on screen in the `all`
 * and `none` modes, greyed, because the list is the only place the service names appear.
 *
 * A selection whose service has since left the list is kept and shown by itself. Dropping it
 * would be the console deleting an answer nobody was asked to re-give.
 */
import { useMemo, useState } from 'react';
import { Badge, Button, Checkbox, Field, Input, Note } from '@/components/console/kit';
import type { MessageKey } from '@/lib/console/messages';
import type { ReferenceChoice } from './ListDocFields';
import { foldForSearch, scopeToToken, tokenToScope, type OfferServiceScope } from '@/lib/content/offer-services';

export interface OfferServicesFieldProps {
  id: string;
  /** the form token: `''` unanswered, `'*'` all, `'none'` explicitly none, else comma-separated uids */
  value: string;
  choices: ReferenceChoice[];
  disabled: boolean;
  errors: string[];
  labels: Record<MessageKey, string>;
  onChange: (next: string) => void;
}

/**
 * Arabic counts the way the language does: one, two, a handful, then a number.
 *
 * The catalog holds the four shapes, so this only picks one. `{n}` is filled here rather than
 * in the catalog because the two other forms have no number in them at all.
 */
function countLabel(count: number, labels: Record<MessageKey, string>): string {
  if (count === 1) return labels['content.offer.services.n_one'];
  if (count === 2) return labels['content.offer.services.n_two'];
  const key: MessageKey = count <= 10 ? 'content.offer.services.n_few' : 'content.offer.services.n_many';
  return labels[key].replace('{n}', String(count));
}

/**
 * The badge's one line per state.
 *
 * The editor's picker and the offer's list row read the same four answers from two different
 * places — a form token and a stored column — and a badge that worded them differently in the
 * two would make an owner doubt which one the site uses.
 */
function badgeOf(scope: OfferServiceScope, labels: Record<MessageKey, string>): { tone: 'ok' | 'neutral' | 'warn'; text: string } {
  if (scope.state === 'all') return { tone: 'ok', text: labels['content.offer.services.all.label'] };
  if (scope.state === 'none') return { tone: 'neutral', text: labels['content.offer.services.none.label'] };
  if (scope.state === 'unconfigured') return { tone: 'warn', text: labels['content.offer.services.unconfigured'] };
  return { tone: 'ok', text: countLabel(scope.serviceUids.length, labels) };
}

export function OfferServicesField({ id, value, choices, disabled, errors, labels, onChange }: Readonly<OfferServicesFieldProps>) {
  const [query, setQuery] = useState('');
  const scope = useMemo(() => tokenToScope(value), [value]);
  const picked = scope.state === 'some' ? scope.serviceUids : [];
  const labelOf = useMemo(() => new Map(choices.map((choice) => [choice.key, choice.label])), [choices]);
  const gone = picked.filter((uid) => !labelOf.has(uid));

  const badge = badgeOf(scope, labels);

  /** Picking a service out of `all` / `none` / unanswered answers the question with that one service. */
  const toggle = (uid: string, on: boolean): void => {
    const next = on ? [...picked, uid] : picked.filter((key) => key !== uid);
    onChange(scopeToToken(next.length === 0 ? { state: 'none' } : { state: 'some', serviceUids: next }));
  };

  const matching = query === '' ? choices : choices.filter((choice) => foldForSearch(choice.label).includes(foldForSearch(query)));

  return (
    <Field
      htmlFor={id}
      errors={errors}
      label={
        <span className="console-offer-services-head">
          {labels['content.field.applicableServices']}
          <Badge tone={badge.tone}>{badge.text}</Badge>
        </span>
      }
      note={
        scope.state === 'unconfigured' ? (
          <Note tone="warn">{labels['content.offer.services.unconfigured.hint']}</Note>
        ) : scope.state === 'all' ? (
          <Note>{labels['content.offer.services.all.hint']}</Note>
        ) : null
      }
    >
      <div className="console-offer-services">
        <div className="console-offer-services-modes">
          <Button size="sm" active={scope.state === 'all'} disabled={disabled} onClick={() => onChange('*')}>
            {labels['content.offer.services.all']}
          </Button>
          <Button size="sm" active={scope.state === 'none'} disabled={disabled} onClick={() => onChange('none')}>
            {labels['content.offer.services.none']}
          </Button>
          {scope.state !== 'unconfigured' && (
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange('')}>
              {labels['content.offer.services.unset']}
            </Button>
          )}
        </div>

        <Input
          id={id}
          type="search"
          value={query}
          disabled={disabled}
          placeholder={labels['content.offer.services.search']}
          aria-label={labels['content.offer.services.search']}
          onChange={(event) => setQuery(event.target.value)}
        />

        {matching.length === 0 ? (
          <Note>{labels['content.offer.services.search.empty']}</Note>
        ) : (
          <div className="console-offer-services-list" role="group" aria-label={labels['content.field.applicableServices']}>
            {matching.map((choice) => (
              <Checkbox
                key={choice.key}
                label={choice.label}
                checked={picked.includes(choice.key)}
                disabled={disabled || scope.state === 'all' || scope.state === 'none'}
                onChange={(event) => toggle(choice.key, event.target.checked)}
              />
            ))}
          </div>
        )}

        {gone.length > 0 && (
          <div className="console-offer-services-gone">
            <Note tone="warn">{labels['content.offer.services.gone']}</Note>
            {gone.map((uid) => (
              <div className="console-offer-services-gone-row" key={uid}>
                <span className="console-offer-services-gone-key">{uid}</span>
                <Button size="sm" variant="danger" disabled={disabled} onClick={() => onChange(scopeToToken({ state: 'some', serviceUids: picked.filter((key) => key !== uid) }))}>
                  {labels['content.list.unknown.remove']}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Field>
  );
}

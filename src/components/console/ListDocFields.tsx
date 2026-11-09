'use client';

/**
 * The typed form of one list item's document.
 *
 * The console used to draw a list item as a textarea holding JSON. This is the replacement:
 * one labelled control per field the list's schema names, both languages side by side for a
 * bilingual field, an Add/Remove pair for every repeatable one, and no box anywhere that
 * accepts a document by hand.
 *
 * Four things deserve a note:
 *
 * **A picture is an upload, never a path.** The schema's `image` field draws `ImagePicker`,
 * which is the same control the article editor uses; the value it writes is the address the
 * server returned.
 *
 * **A group is a door, not a filter.** Consecutive fields sharing a `group` collapse into one
 * `<details>`, because a service row has fourteen of them and fifty-two fields behind them.
 * The controls stay in the document while the door is shut, so hiding a section never discards
 * what somebody typed into it, and a field that still owes a fix says so on the handle.
 *
 * **A key the form does not describe is shown, not dropped.** The editor keeps those entries
 * in a hidden form key and this block lists them one by one with a Remove button, because
 * the server refuses a document with unknown keys and silently deleting somebody's data is
 * worse than asking.
 *
 * **A bilingual box is named after its field, in the voice's copy of the label.** Each pair
 * keeps the short language word on screen and puts `Field — Language` in front of it for a
 * screen reader, so a person hearing the row one control at a time knows which field either
 * box belongs to. See `pairName`.
 */
import { Fragment, useState } from 'react';
import { Badge, Button, Checkbox, Field, Input, Note, Select, Textarea, pairName } from '@/components/console/kit';
import { ClipPicker } from './ClipPicker';
import { ImagePicker } from './ImagePicker';
import { BlockEditor } from './BlockEditor';
import type { Form } from '@/lib/console/editor-form';
import type { MessageKey } from '@/lib/console/messages';
import { UNKNOWN_FORM_KEY, type ChildField, type FieldGroup, type ListField, type ListSchema } from '@/lib/content/list-schema';
import type { ContentLocale } from '@/lib/content/kinds';

/** A row a `refs` field may point at, as the server resolved it for this screen. */
export interface ReferenceChoice {
  key: string;
  label: string;
}

export interface ListDocFieldsProps {
  schema: ListSchema;
  form: Form;
  /** messages keyed by the field root (`name`, `benefits`, `children.0` …) */
  errors: Record<string, string[]>;
  referenceOptions: Record<string, ReferenceChoice[]>;
  locale: ContentLocale;
  disabled: boolean;
  labels: Record<MessageKey, string>;
  onChange: (key: string, value: string | boolean) => void;
}

const INDEXED = /^(.+?)\.(\d+)(?:\.(.+))?$/;

/** One past the highest index the form names for a stem, so a new row never overwrites one. */
function nextIndex(form: Form, stem: string): number {
  let highest = -1;
  for (const key of Object.keys(form)) {
    const match = INDEXED.exec(key);
    if (!match) continue;
    if (match[1] === stem || match[1] === `${stem}_ar` || match[1] === `${stem}_en`) highest = Math.max(highest, Number(match[2]));
  }
  return highest + 1;
}

function indicesOf(form: Form, stem: string): number[] {
  const seen = new Set<number>();
  for (const key of Object.keys(form)) {
    const match = INDEXED.exec(key);
    if (!match) continue;
    if (match[1] === stem || match[1] === `${stem}_ar` || match[1] === `${stem}_en`) seen.add(Number(match[2]));
  }
  return [...seen].sort((a, b) => a - b);
}

/** The fields one disclosure holds: a group's own, or the run of fields no group claims. */
interface FieldChunk {
  group: FieldGroup | null;
  fields: ListField[];
}

/**
 * The schema's fields, in the schema's order, cut where the group changes.
 *
 * A list whose schema names no group at all comes back as one ungrouped chunk, which is the
 * flat form it drew before the service row grew fourteen sections.
 */
function chunksOf(schema: ListSchema): FieldChunk[] {
  const chunks: FieldChunk[] = [];
  for (const field of schema.fields) {
    const last = chunks[chunks.length - 1];
    if (last && last.group?.key === field.group?.key) last.fields.push(field);
    else chunks.push({ group: field.group ?? null, fields: [field] });
  }
  return chunks;
}

export function ListDocFields({
  schema,
  form,
  errors,
  referenceOptions,
  locale,
  disabled,
  labels,
  onChange,
}: Readonly<ListDocFieldsProps>) {
  const unknown = readUnknown(form[UNKNOWN_FORM_KEY]);
  // Which doors a person has shut. Nothing else about the form moves when they do: the
  // fields stay mounted inside a closed `<details>`, so collapsing a group never costs
  // anybody a sentence they typed, and the value the save reads is the value in the box.
  const [shut, setShut] = useState<Record<string, boolean>>({});

  // One disclosure per group, so a fifty-field service row can be read one part at a time.
  const chunks = chunksOf(schema);

  return (
    <div className="console-doc-form">
      {chunks.map((chunk) => {
        const fields = chunk.fields.map((field) => (
          <SchemaField
            key={field.stem}
            field={field}
            form={form}
            errors={errors[field.stem] ?? []}
            referenceOptions={referenceOptions[field.stem] ?? []}
            locale={locale}
            disabled={disabled}
            labels={labels}
            onChange={onChange}
          />
        ));
        const group = chunk.group;
        if (!group) return <Fragment key="*">{fields}</Fragment>;
        const owed = chunk.fields.some((field) => (errors[field.stem] ?? []).length > 0);
        return (
          <details
            key={group.key}
            className="console-doc-group-box"
            open={!shut[group.key]}
            // Read the element now, not inside the updater below. A `<details>` fires
            // `toggle` when React sets `open` on mount — including on a soft navigation —
            // and React may run the updater after the event has been dispatched, when the
            // browser has already nulled `currentTarget`. That updater read `.open` of
            // null and took the whole detail screen down.
            onToggle={(event) => {
              const open = event.currentTarget.open;
              setShut((current) => ({ ...current, [group.key]: !open }));
            }}
          >
            <summary className="console-doc-group">
              <span className="console-doc-group-caret" aria-hidden="true" />
              <span className="console-doc-group-name">{group.label[locale] || group.label.en || group.label.ar}</span>
              <span className="console-doc-group-count">{chunk.fields.length}</span>
              {owed && <span className="console-doc-group-error">{labels['content.list.group.error']}</span>}
            </summary>
            <div className="console-doc-group-fields">{fields}</div>
          </details>
        );
      })}

      {Object.keys(unknown).length > 0 && (
        <section className="console-doc-unknown" aria-labelledby="list-unknown-heading">
          <h3 id="list-unknown-heading" className="console-doc-unknown-heading">
            {labels['content.list.unknown.heading']}
          </h3>
          <Note>{labels['content.list.unknown.hint']}</Note>
          <ul className="console-doc-unknown-rows">
            {Object.keys(unknown).map((key) => (
              <li key={key} className="console-doc-unknown-row">
                <code className="console-doc-unknown-key">{key}</code>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={disabled}
                  onClick={() => {
                    const rest = { ...unknown };
                    delete rest[key];
                    onChange(UNKNOWN_FORM_KEY, JSON.stringify(rest));
                  }}
                >
                  {labels['content.list.unknown.remove']}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The hidden form entry, which only `ListDocFields` writes, as an object. */
function readUnknown(value: Form[string] | undefined): Record<string, unknown> {
  const raw = String(value ?? '');
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function textOf(form: Form, key: string): string {
  return String(form[key] ?? '');
}

/**
 * The description that travels with one picture into the media library.
 *
 * A list with a single image names it `alt`. A before/after case has two pictures and one
 * description each, so the schema names `beforeAlt` and `afterAlt` — and the upload has to
 * carry the right one, or the after picture gets saved with the before picture's words.
 */
function altOf(form: Form, stem: string): { ar: string; en: string } {
  const own = `${stem}Alt`;
  const source = `${own}_ar` in form || `${own}_en` in form ? own : 'alt';
  return { ar: textOf(form, `${source}_ar`), en: textOf(form, `${source}_en`) };
}

function SchemaField({
  field,
  form,
  errors,
  referenceOptions,
  locale,
  disabled,
  labels,
  onChange,
}: Readonly<{
  field: ListField;
  form: Form;
  errors: string[];
  referenceOptions: ReferenceChoice[];
  locale: ContentLocale;
  disabled: boolean;
  labels: Record<MessageKey, string>;
  onChange: ListDocFieldsProps['onChange'];
}>) {
  const label = field.label[locale] || field.label.en || field.label.ar;
  const hint = field.hint ? field.hint[locale] || field.hint.en || field.hint.ar : '';
  const id = `list-field-${field.stem}`;
  const errorsNode = errors.map((message) => (
    <span key={message} className="console-field-error" role="alert">
      {message}
    </span>
  ));

  if (field.type === 'text') {
    if (field.mono) {
      // One box, not a pair: this value is the same in both languages, and a number typed
      // twice is a number that can end up typed wrong once. The form key is the bare stem,
      // which is the key the site and the importer already read.
      return (
        <Field htmlFor={id} errors={errors} label={label} note={hint ? <Note>{hint}</Note> : null}>
          <Input
            id={id}
            dir="ltr"
            value={textOf(form, field.stem)}
            disabled={disabled}
            maxLength={field.max}
            aria-invalid={errors.length > 0 || undefined}
            onChange={(event) => onChange(field.stem, event.target.value)}
          />
        </Field>
      );
    }
    const ar = textOf(form, `${field.stem}_ar`);
    const en = textOf(form, `${field.stem}_en`);
    return (
      <div className="console-doc-field" data-invalid={errors.length > 0 || undefined}>
        <span className="console-doc-label" id={`${id}-label`}>
          {label}
          {field.required ? <Badge tone="warn">{labels['content.issue.required']}</Badge> : null}
        </span>
        {hint ? <Note>{hint}</Note> : null}
        <div className="console-doc-pair">
          {field.html ? (
            <>
              <BlockEditor
                labels={labels}
                value={ar}
                disabled={disabled}
                inputId={`${id}-ar`}
                title={`${label} — ${labels['content.locale.ar']}`}
                rtl
                onChange={(next) => onChange(`${field.stem}_ar`, next)}
              />
              <BlockEditor
                labels={labels}
                value={en}
                disabled={disabled}
                inputId={`${id}-en`}
                title={`${label} — ${labels['content.locale.en']}`}
                rtl={false}
                onChange={(next) => onChange(`${field.stem}_en`, next)}
              />
            </>
          ) : (
            <>
              <Field label={pairName(label, labels['content.locale.ar'])} htmlFor={`${id}-ar`}>
                {field.multiline ? (
                  <Textarea
                    id={`${id}-ar`}
                    rows={4}
                    dir="rtl"
                    value={ar}
                    disabled={disabled}
                    maxLength={field.max}
                    aria-invalid={errors.length > 0 || undefined}
                    onChange={(event) => onChange(`${field.stem}_ar`, event.target.value)}
                  />
                ) : (
                  <Input
                    id={`${id}-ar`}
                    dir="rtl"
                    value={ar}
                    disabled={disabled}
                    maxLength={field.max}
                    aria-invalid={errors.length > 0 || undefined}
                    onChange={(event) => onChange(`${field.stem}_ar`, event.target.value)}
                  />
                )}
              </Field>
              <Field label={pairName(label, labels['content.locale.en'])} htmlFor={`${id}-en`}>
                {field.multiline ? (
                  <Textarea
                    id={`${id}-en`}
                    rows={4}
                    dir="ltr"
                    value={en}
                    disabled={disabled}
                    maxLength={field.max}
                    aria-invalid={errors.length > 0 || undefined}
                    onChange={(event) => onChange(`${field.stem}_en`, event.target.value)}
                  />
                ) : (
                  <Input
                    id={`${id}-en`}
                    dir="ltr"
                    value={en}
                    disabled={disabled}
                    maxLength={field.max}
                    aria-invalid={errors.length > 0 || undefined}
                    onChange={(event) => onChange(`${field.stem}_en`, event.target.value)}
                  />
                )}
              </Field>
            </>
          )}
        </div>
        {errorsNode}
      </div>
    );
  }

  if (field.type === 'list') {
    const rows = indicesOf(form, field.stem);
    return (
      <div className="console-doc-field" data-invalid={errors.length > 0 || undefined}>
        <span className="console-doc-label" id={`${id}-label`}>
          {label}
        </span>
        {hint ? <Note>{hint}</Note> : null}
        <div className="console-doc-rows">
          {rows.map((index) => (
            <div className="console-doc-row" key={index}>
              <Field label={pairName(`${label} ${index + 1}`, labels['content.locale.ar'])} htmlFor={`${id}-ar-${index}`}>
                <Input
                  id={`${id}-ar-${index}`}
                  dir="rtl"
                  value={textOf(form, `${field.stem}_ar.${index}`)}
                  disabled={disabled}
                  onChange={(event) => onChange(`${field.stem}_ar.${index}`, event.target.value)}
                />
              </Field>
              <Field label={pairName(`${label} ${index + 1}`, labels['content.locale.en'])} htmlFor={`${id}-en-${index}`}>
                <Input
                  id={`${id}-en-${index}`}
                  dir="ltr"
                  value={textOf(form, `${field.stem}_en.${index}`)}
                  disabled={disabled}
                  onChange={(event) => onChange(`${field.stem}_en.${index}`, event.target.value)}
                />
              </Field>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => {
                  onChange(`${field.stem}_ar.${index}`, '');
                  onChange(`${field.stem}_en.${index}`, '');
                }}
              >
                {labels['content.list.remove']}
              </Button>
            </div>
          ))}
        </div>
        <AddRow
          disabled={disabled}
          label={labels['content.list.add']}
          onClick={() => {
            const index = nextIndex(form, field.stem);
            onChange(`${field.stem}_ar.${index}`, '');
            onChange(`${field.stem}_en.${index}`, '');
          }}
        />
        {errorsNode}
      </div>
    );
  }

  if (field.type === 'strings') {
    const rows = indicesOf(form, field.stem);
    return (
      <div className="console-doc-field" data-invalid={errors.length > 0 || undefined}>
        <span className="console-doc-label" id={`${id}-label`}>
          {label}
        </span>
        {hint ? <Note>{hint}</Note> : null}
        <div className="console-doc-rows">
          {rows.map((index) => (
            <div className="console-doc-row" key={index}>
              <Field label={`${label} ${index + 1}`} htmlFor={`${id}-${index}`}>
                <Input
                  id={`${id}-${index}`}
                  value={textOf(form, `${field.stem}.${index}`)}
                  disabled={disabled}
                  onChange={(event) => onChange(`${field.stem}.${index}`, event.target.value)}
                />
              </Field>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => onChange(`${field.stem}.${index}`, '')}
              >
                {labels['content.list.remove']}
              </Button>
            </div>
          ))}
        </div>
        <AddRow
          disabled={disabled}
          label={labels['content.list.add']}
          onClick={() => onChange(`${field.stem}.${nextIndex(form, field.stem)}`, '')}
        />
        {errorsNode}
      </div>
    );
  }

  if (field.type === 'children') {
    const rows = indicesOf(form, field.stem);
    return (
      <div className="console-doc-field" data-invalid={errors.length > 0 || undefined}>
        <span className="console-doc-label" id={`${id}-label`}>
          {label}
        </span>
        {hint ? <Note>{hint}</Note> : null}
        <div className="console-doc-rows">
          {rows.map((index) => (
            <div className="console-doc-child" key={index}>
              {field.row.map((cell) => (
                <ChildInput
                  key={cell.stem}
                  cell={cell}
                  row={field.row}
                  stem={field.stem}
                  index={index}
                  form={form}
                  locale={locale}
                  disabled={disabled}
                  labels={labels}
                  onChange={onChange}
                />
              ))}
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => {
                  for (const cell of field.row) {
                    for (const name of cell.type === 'text' ? [`${cell.stem}_ar`, `${cell.stem}_en`] : [cell.stem]) {
                      onChange(`${field.stem}.${index}.${name}`, '');
                    }
                  }
                }}
              >
                {labels['content.list.remove']}
              </Button>
            </div>
          ))}
        </div>
        <AddRow
          disabled={disabled}
          label={labels['content.list.add']}
          onClick={() => {
            const index = nextIndex(form, field.stem);
            for (const cell of field.row) {
              for (const name of cell.type === 'text' ? [`${cell.stem}_ar`, `${cell.stem}_en`] : [cell.stem]) {
                onChange(`${field.stem}.${index}.${name}`, '');
              }
            }
          }}
        />
        {errorsNode}
      </div>
    );
  }

  if (field.type === 'image') {
    return (
      <Field
        htmlFor={id}
        errors={errors}
        label={
          <>
            {label}
            {field.required ? <Badge tone="warn">{labels['content.issue.required']}</Badge> : null}
          </>
        }
        note={hint ? <Note>{hint}</Note> : null}
      >
        <ImagePicker
          labels={labels}
          value={textOf(form, field.stem)}
          disabled={disabled}
          inputId={id}
          alt={altOf(form, field.stem)}
          onChange={(next) => onChange(field.stem, next)}
        />
      </Field>
    );
  }

  if (field.type === 'clip') {
    return (
      <Field
        htmlFor={id}
        errors={errors}
        label={
          <>
            {label}
            {field.required ? <Badge tone="warn">{labels['content.issue.required']}</Badge> : null}
          </>
        }
        note={hint ? <Note>{hint}</Note> : null}
      >
        <ClipPicker
          labels={labels}
          accept={field.accept}
          value={textOf(form, field.stem)}
          disabled={disabled}
          inputId={id}
          onChange={(next) => onChange(field.stem, next)}
        />
      </Field>
    );
  }

  if (field.type === 'flag') {
    return (
      <div className="console-doc-field" data-invalid={errors.length > 0 || undefined}>
        <Checkbox
          id={id}
          label={label}
          checked={Boolean(form[field.stem])}
          disabled={disabled}
          onChange={(event) => onChange(field.stem, event.target.checked)}
        />
        {hint ? <Note>{hint}</Note> : null}
        {errorsNode}
      </div>
    );
  }

  if (field.type === 'select') {
    const value = textOf(form, field.stem);
    return (
      <Field htmlFor={id} errors={errors} label={label} note={hint ? <Note>{hint}</Note> : null}>
        <Select id={id} value={value} disabled={disabled} onChange={(event) => onChange(field.stem, event.target.value)}>
          <option value="">—</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label[locale] || option.label.en || option.label.ar}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.type === 'refs') {
    const selected = textOf(form, field.stem)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return (
      <div className="console-doc-field" data-invalid={errors.length > 0 || undefined}>
        <span className="console-doc-label">{label}</span>
        {hint ? <Note>{hint}</Note> : null}
        {referenceOptions.length === 0 ? (
          <Note>{labels['content.list.refs.empty']}</Note>
        ) : (
          <div className="console-doc-refs">
            {referenceOptions.map((choice) => {
              const checked = selected.includes(choice.key);
              return (
                <Checkbox
                  key={choice.key}
                  label={choice.label}
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => {
                    const next = event.target.checked ? [...selected, choice.key] : selected.filter((key) => key !== choice.key);
                    onChange(field.stem, next.join(','));
                  }}
                />
              );
            })}
          </div>
        )}
        {errorsNode}
      </div>
    );
  }

  if (field.type === 'story') {
    // One article, chosen by name, and choosing none is a complete answer: a result the owner
    // titled and photographed is a story whether or not the journal has one for it. The picker
    // is here for the article that adds a fuller text behind the card.
    const value = textOf(form, field.stem);
    if (referenceOptions.length === 0) {
      return (
        <div className="console-doc-field" data-invalid={errors.length > 0 || undefined}>
          <span className="console-doc-label">{label}</span>
          {hint ? <Note>{hint}</Note> : null}
          <Note>{labels['content.list.story.empty']}</Note>
          {errorsNode}
        </div>
      );
    }
    return (
      <Field htmlFor={id} errors={errors} label={label} note={hint ? <Note>{hint}</Note> : null}>
        <Select id={id} value={value} disabled={disabled} onChange={(event) => onChange(field.stem, event.target.value)}>
          <option value="">{labels['content.list.story.none']}</option>
          {referenceOptions.map((choice) => (
            <option key={choice.key} value={choice.key}>
              {choice.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.type === 'number') {
    return (
      <Field htmlFor={id} errors={errors} label={label} note={hint ? <Note>{hint}</Note> : null}>
        <Input
          id={id}
          type="number"
          value={textOf(form, field.stem)}
          disabled={disabled}
          onChange={(event) => onChange(field.stem, event.target.value)}
        />
      </Field>
    );
  }

  if (field.type === 'sections') {
    const rows = indicesOf(form, field.stem);
    const labelOf = (key: string): string => {
      const section = field.sections.find((candidate) => candidate.key === key);
      return section ? section.label[locale] || section.label.en || section.label.ar : key;
    };
    const swap = (from: number, to: number) => {
      const fromKey = textOf(form, `${field.stem}.${from}.key`);
      const toKey = textOf(form, `${field.stem}.${to}.key`);
      const fromVisible = Boolean(form[`${field.stem}.${from}.visible`]);
      const toVisible = Boolean(form[`${field.stem}.${to}.visible`]);
      onChange(`${field.stem}.${from}.key`, toKey);
      onChange(`${field.stem}.${to}.key`, fromKey);
      onChange(`${field.stem}.${from}.visible`, toVisible);
      onChange(`${field.stem}.${to}.visible`, fromVisible);
    };
    return (
      <div className="console-doc-field" data-invalid={errors.length > 0 || undefined}>
        <span className="console-doc-label" id={`${id}-label`}>
          {label}
        </span>
        {hint ? <Note>{hint}</Note> : null}
        <ol className="console-doc-sections" aria-labelledby={`${id}-label`}>
          {rows.map((index, position) => {
            const key = textOf(form, `${field.stem}.${index}.key`);
            const visible = Boolean(form[`${field.stem}.${index}.visible`]);
            const name = labelOf(key);
            return (
              <li className="console-doc-section" key={index} data-hidden={!visible || undefined}>
                <span className="console-doc-section-name">
                  {name}
                  {visible ? null : <Badge tone="neutral">{labels['content.sections.hidden']}</Badge>}
                </span>
                <div className="console-doc-section-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled || position === 0}
                    aria-label={`${name}: ${labels['content.order.up']}`}
                    onClick={() => {
                      const previous = rows[position - 1];
                      if (previous !== undefined) swap(index, previous);
                    }}
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled || position === rows.length - 1}
                    aria-label={`${name}: ${labels['content.order.down']}`}
                    onClick={() => {
                      const next = rows[position + 1];
                      if (next !== undefined) swap(index, next);
                    }}
                  >
                    ↓
                  </Button>
                  <Checkbox
                    label={labels['content.sections.visible']}
                    checked={visible}
                    disabled={disabled}
                    aria-label={`${name}: ${visible ? labels['content.sections.hide'] : labels['content.sections.show']}`}
                    onChange={(event) => onChange(`${field.stem}.${index}.visible`, event.target.checked)}
                  />
                </div>
              </li>
            );
          })}
        </ol>
        {errorsNode}
      </div>
    );
  }

  return (
    <Field htmlFor={id} errors={errors} label={label} note={hint ? <Note>{hint}</Note> : null}>
      <Input
        id={id}
        dir={field.type === 'href' ? 'ltr' : undefined}
        value={textOf(form, field.stem)}
        disabled={disabled}
        onChange={(event) => onChange(field.stem, event.target.value)}
      />
    </Field>
  );
}

function ChildInput({
  cell,
  row,
  stem,
  index,
  form,
  locale,
  disabled,
  labels,
  onChange,
}: Readonly<{
  cell: ChildField;
  row: readonly ChildField[];
  stem: string;
  index: number;
  form: Form;
  locale: ContentLocale;
  disabled: boolean;
  labels: Record<MessageKey, string>;
  onChange: ListDocFieldsProps['onChange'];
}>) {
  const label = cell.label[locale] || cell.label.en || cell.label.ar;
  if (cell.type === 'href') {
    const key = `${stem}.${index}.${cell.stem}`;
    return (
      <Field label={label} htmlFor={`child-${key}`}>
        <Input
          id={`child-${key}`}
          dir="ltr"
          value={textOf(form, key)}
          disabled={disabled}
          onChange={(event) => onChange(key, event.target.value)}
        />
      </Field>
    );
  }
  if (cell.type === 'image') {
    const key = `${stem}.${index}.${cell.stem}`;
    // A gallery row names its own picture in the `alt` cell beside it; a step's picture is
    // described by the service's hero description. The upload carries whichever exists, so
    // the media library never files a picture under somebody else's words.
    const ownAlt = row.some((candidate) => candidate.type === 'text' && candidate.stem === 'alt');
    const alt = ownAlt
      ? { ar: textOf(form, `${stem}.${index}.alt_ar`), en: textOf(form, `${stem}.${index}.alt_en`) }
      : { ar: textOf(form, 'alt_ar'), en: textOf(form, 'alt_en') };
    return (
      <Field label={label} htmlFor={`child-${key}`}>
        <ImagePicker
          labels={labels}
          value={textOf(form, key)}
          disabled={disabled}
          inputId={`child-${key}`}
          alt={alt}
          onChange={(next) => onChange(key, next)}
        />
      </Field>
    );
  }
  if (cell.type === 'select') {
    const key = `${stem}.${index}.${cell.stem}`;
    return (
      <Field label={label} htmlFor={`child-${key}`}>
        <Select id={`child-${key}`} value={textOf(form, key)} disabled={disabled} onChange={(event) => onChange(key, event.target.value)}>
          <option value="">—</option>
          {(cell.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label[locale] || option.label.en || option.label.ar}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  const arKey = `${stem}.${index}.${cell.stem}_ar`;
  const enKey = `${stem}.${index}.${cell.stem}_en`;
  return (
    <>
      <Field label={pairName(label, labels['content.locale.ar'])} htmlFor={`child-${arKey}`}>
        {cell.multiline ? (
          <Textarea
            id={`child-${arKey}`}
            rows={3}
            dir="rtl"
            value={textOf(form, arKey)}
            disabled={disabled}
            onChange={(event) => onChange(arKey, event.target.value)}
          />
        ) : (
          <Input
            id={`child-${arKey}`}
            dir="rtl"
            value={textOf(form, arKey)}
            disabled={disabled}
            onChange={(event) => onChange(arKey, event.target.value)}
          />
        )}
      </Field>
      <Field label={pairName(label, labels['content.locale.en'])} htmlFor={`child-${enKey}`}>
        {cell.multiline ? (
          <Textarea
            id={`child-${enKey}`}
            rows={3}
            dir="ltr"
            value={textOf(form, enKey)}
            disabled={disabled}
            onChange={(event) => onChange(enKey, event.target.value)}
          />
        ) : (
          <Input
            id={`child-${enKey}`}
            dir="ltr"
            value={textOf(form, enKey)}
            disabled={disabled}
            onChange={(event) => onChange(enKey, event.target.value)}
          />
        )}
      </Field>
    </>
  );
}

function AddRow({ disabled, label, onClick }: Readonly<{ disabled: boolean; label: string; onClick: () => void }>) {
  return (
    <div className="console-doc-add">
      <Button size="sm" variant="default" disabled={disabled} onClick={onClick}>
        + {label}
      </Button>
    </div>
  );
}

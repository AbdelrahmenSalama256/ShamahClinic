'use client';

/**
 * The typed form of one list item's document.
 *
 * The console used to draw a list item as a textarea holding JSON. This is the replacement:
 * one labelled control per field the list's schema names, both languages side by side for a
 * bilingual field, an Add/Remove pair for every repeatable one, and no box anywhere that
 * accepts a document by hand.
 *
 * Two controls deserve a note:
 *
 * **A picture is an upload, never a path.** The schema's `image` field draws `ImagePicker`,
 * which is the same control the article editor uses; the value it writes is the address the
 * server returned.
 *
 * **A key the form does not describe is shown, not dropped.** The editor keeps those entries
 * in a hidden form key and this block lists them one by one with a Remove button, because
 * the server refuses a document with unknown keys and silently deleting somebody's data is
 * worse than asking.
 */
import { Badge, Button, Checkbox, Field, Input, Note, Select, Textarea } from '@/components/console/kit';
import { ImagePicker } from './ImagePicker';
import { RichEditor } from './RichEditor';
import type { Form } from '@/lib/console/editor-form';
import type { MessageKey } from '@/lib/console/messages';
import { UNKNOWN_FORM_KEY, type ChildField, type ListField, type ListSchema } from '@/lib/content/list-schema';
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

  return (
    <div className="console-doc-form">
      {schema.fields.map((field) => (
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
      ))}

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
              <RichEditor
                labels={labels}
                value={ar}
                disabled={disabled}
                inputId={`${id}-ar`}
                title={`${label} — ${labels['content.locale.ar']}`}
                rtl
                onChange={(next) => onChange(`${field.stem}_ar`, next)}
              />
              <RichEditor
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
              <Field label={labels['content.locale.ar']} htmlFor={`${id}-ar`}>
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
              <Field label={labels['content.locale.en']} htmlFor={`${id}-en`}>
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
              <Field label={labels['content.locale.ar']} htmlFor={`${id}-ar-${index}`}>
                <Input
                  id={`${id}-ar-${index}`}
                  dir="rtl"
                  value={textOf(form, `${field.stem}_ar.${index}`)}
                  disabled={disabled}
                  onChange={(event) => onChange(`${field.stem}_ar.${index}`, event.target.value)}
                />
              </Field>
              <Field label={labels['content.locale.en']} htmlFor={`${id}-en-${index}`}>
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
          alt={{ ar: textOf(form, 'alt_ar'), en: textOf(form, 'alt_en') }}
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
  stem,
  index,
  form,
  locale,
  disabled,
  labels,
  onChange,
}: Readonly<{
  cell: ChildField;
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
  return (
    <>
      <Field label={`${label} — ${labels['content.locale.ar']}`} htmlFor={`child-${stem}.${index}.${cell.stem}_ar`}>
        <Input
          id={`child-${stem}.${index}.${cell.stem}_ar`}
          dir="rtl"
          value={textOf(form, `${stem}.${index}.${cell.stem}_ar`)}
          disabled={disabled}
          onChange={(event) => onChange(`${stem}.${index}.${cell.stem}_ar`, event.target.value)}
        />
      </Field>
      <Field label={`${label} — ${labels['content.locale.en']}`} htmlFor={`child-${stem}.${index}.${cell.stem}_en`}>
        <Input
          id={`child-${stem}.${index}.${cell.stem}_en`}
          dir="ltr"
          value={textOf(form, `${stem}.${index}.${cell.stem}_en`)}
          disabled={disabled}
          onChange={(event) => onChange(`${stem}.${index}.${cell.stem}_en`, event.target.value)}
        />
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

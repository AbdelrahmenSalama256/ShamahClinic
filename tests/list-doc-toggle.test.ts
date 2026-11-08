// @vitest-environment jsdom
/**
 * The list editor's disclosures must survive a programmatic `open`.
 *
 * A `details` element fires `toggle` whenever its `open` property changes — including the
 * change React makes on mount when the row is soft-navigated into place. Reading
 * `event.currentTarget` inside the `setShut` updater is not safe there: React may call the
 * updater after the event has been dispatched, and the browser has already nulled
 * `currentTarget`. The updater then throws `Cannot read properties of null (reading
 * 'open')`, which is the console's crash screen.
 *
 * The regression is two-layered: the rendered form must accept a toggle without throwing,
 * and the source must never put a live event inside a state updater again.
 */
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { catalogFor } from '../src/lib/console/messages';
import { ListDocFields } from '../src/components/console/ListDocFields';
import { emptyListDocForm, listSchemaOf } from '../src/lib/content/list-schema';

// React 19's `act` needs the host to say this is an act environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('list editor disclosures', () => {
  it('accepts the mount/toggle event without reading a null currentTarget', async () => {
    const schema = listSchemaOf('services');
    expect(schema).not.toBeNull();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        createElement(ListDocFields, {
          schema: schema!,
          form: emptyListDocForm(schema!),
          errors: {},
          referenceOptions: {},
          locale: 'en',
          disabled: false,
          labels: catalogFor('en'),
          onChange: () => undefined,
        }),
      );
    });

    const boxes = [...host.querySelectorAll<HTMLDetailsElement>('details.console-doc-group-box')];
    expect(boxes.length).toBeGreaterThan(0);
    const first = boxes[0];

    // What the browser does when a mounted row's `open` is set: a toggle with no user.
    await act(async () => {
      first.open = false;
      first.dispatchEvent(new Event('toggle'));
    });
    await act(async () => {
      first.open = true;
      first.dispatchEvent(new Event('toggle'));
    });

    // The group answered the second toggle instead of staying shut.
    expect(first.open).toBe(true);

    await act(async () => root.unmount());
    host.remove();
  });

  it('never reads an event inside a state updater', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'components', 'console', 'ListDocFields.tsx'), 'utf8');
    // `setShut((current) => ... event.currentTarget.open ...)` is the crash.
    expect(source).not.toMatch(/set[A-Z]\w*\(\([^)]*\)\s*=>[\s\S]{0,200}?event\.currentTarget/);
  });
});

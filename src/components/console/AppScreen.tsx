'use client';

/**
 * The mobile app's bookings and patients.
 *
 * Bookings: confirm, reschedule, mark visited (grants the visit's loyalty points once),
 * mark unconfirmed, or cancel. Patients: see points and bookings, add or take points,
 * block an account (which signs it out everywhere).
 */
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Input, Select, Textarea } from './kit';
import { consoleCall, consoleRead } from './client-api';
import type { AppOverview, ConsoleBooking, ConsoleCustomer } from '@/lib/mobile/console';

type Locale = 'ar' | 'en';
type Overview = AppOverview & { contactHidden?: boolean };

const STATUS: Record<number, { ar: string; en: string; tone: 'neutral' | 'ok' | 'warn' | 'danger' }> = {
  1: { ar: 'جديد', en: 'New', tone: 'warn' },
  2: { ar: 'مؤكد', en: 'Confirmed', tone: 'ok' },
  3: { ar: 'تغيير موعد', en: 'Rescheduled', tone: 'ok' },
  4: { ar: 'تمت الزيارة', en: 'Visited', tone: 'ok' },
  5: { ar: 'لم يرد', en: 'No answer', tone: 'neutral' },
  6: { ar: 'ألغاه المريض', en: 'Cancelled by patient', tone: 'danger' },
  7: { ar: 'ألغته العيادة', en: 'Cancelled by clinic', tone: 'danger' },
};

const T = {
  bookings: { ar: 'الحجوزات', en: 'Bookings' },
  patients: { ar: 'المرضى', en: 'Patients' },
  search: { ar: 'ابحث بالاسم أو الهاتف أو الكود', en: 'Search name, phone or code' },
  allStatuses: { ar: 'كل الحالات', en: 'Every status' },
  upcoming: { ar: 'القادمة', en: 'Upcoming' },
  all: { ar: 'الكل', en: 'All' },
  when: { ar: 'الموعد', en: 'When' },
  patient: { ar: 'المريض', en: 'Patient' },
  branch: { ar: 'الفرع', en: 'Branch' },
  service: { ar: 'الخدمة', en: 'Service' },
  price: { ar: 'السعر', en: 'Price' },
  status: { ar: 'الحالة', en: 'Status' },
  note: { ar: 'ملاحظة للعيادة', en: 'Clinic note' },
  save: { ar: 'حفظ', en: 'Save' },
  empty: { ar: 'لا توجد حجوزات', en: 'No bookings' },
  noPatients: { ar: 'لا يوجد مرضى مسجلون بعد', en: 'No registered patients yet' },
  points: { ar: 'النقاط', en: 'Points' },
  count: { ar: 'الحجوزات', en: 'Bookings' },
  joined: { ar: 'تاريخ التسجيل', en: 'Joined' },
  addPoints: { ar: 'إضافة / خصم نقاط', en: 'Add / take points' },
  pointsHint: { ar: 'رقم سالب للخصم', en: 'Negative to take' },
  block: { ar: 'إيقاف', en: 'Block' },
  unblock: { ar: 'تفعيل', en: 'Unblock' },
  blocked: { ar: 'موقوف', en: 'Blocked' },
  hidden: { ar: 'بيانات التواصل مخفية لصلاحيتك', en: 'Contact details are hidden for your role' },
  failed: { ar: 'لم يتم الحفظ، حاول مرة أخرى', en: 'Not saved, try again' },
  total: { ar: 'مريض مسجل', en: 'registered patients' },
} as const;

export function AppScreen({ initial, locale, canWrite }: Readonly<{ initial: Overview; locale: Locale; canWrite: boolean }>) {
  const w = (key: keyof typeof T) => T[key][locale];
  const [data, setData] = useState<Overview>(initial);
  const [tab, setTab] = useState<'bookings' | 'patients'>('bookings');
  const [status, setStatus] = useState('');
  const [scope, setScope] = useState<'upcoming' | 'all'>('upcoming');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const params = new URLSearchParams({ scope });
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    const res = await consoleRead<Overview>(`/api/console/app?${params}`);
    if (res.data) setData(res.data);
  }, [scope, status, q]);

  useEffect(() => {
    const id = setTimeout(() => void reload(), 250);
    return () => clearTimeout(id);
  }, [reload]);

  async function act(path: string, method: 'PATCH' | 'POST', body: unknown): Promise<boolean> {
    setError('');
    const res = await consoleCall(path, method, body);
    if (res.error) {
      setError(w('failed'));
      return false;
    }
    await reload();
    return true;
  }

  return (
    <div className="console-app-screen">
      <div className="console-tabs" role="tablist">
        <Button active={tab === 'bookings'} onClick={() => setTab('bookings')} role="tab" aria-selected={tab === 'bookings'}>
          {w('bookings')} {data.counts['1'] ? <Badge tone="warn">{data.counts['1']}</Badge> : null}
        </Button>
        <Button active={tab === 'patients'} onClick={() => setTab('patients')} role="tab" aria-selected={tab === 'patients'}>
          {w('patients')} <Badge>{data.customerTotal}</Badge>
        </Button>
      </div>

      <div className="console-app-tools">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={w('search')} aria-label={w('search')} />
        {tab === 'bookings' && (
          <>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={w('status')}>
              <option value="">{w('allStatuses')}</option>
              {Object.entries(STATUS).map(([code, s]) => (
                <option key={code} value={code}>
                  {s[locale]} {data.counts[code] ? `(${data.counts[code]})` : ''}
                </option>
              ))}
            </Select>
            <Button active={scope === 'upcoming'} onClick={() => setScope('upcoming')}>{w('upcoming')}</Button>
            <Button active={scope === 'all'} onClick={() => setScope('all')}>{w('all')}</Button>
          </>
        )}
      </div>

      {data.contactHidden && <p className="console-lede">{w('hidden')}</p>}
      {error && <p role="alert" className="console-lede" style={{ color: 'var(--c-danger, #b42318)' }}>{error}</p>}

      {tab === 'bookings' ? (
        <BookingsTable rows={data.bookings} locale={locale} canWrite={canWrite} w={w} act={act} />
      ) : (
        <PatientsTable rows={data.customers} locale={locale} canWrite={canWrite} w={w} act={act} />
      )}
    </div>
  );
}

type Words = (key: keyof typeof T) => string;
type Act = (path: string, method: 'PATCH' | 'POST', body: unknown) => Promise<boolean>;

function BookingsTable({ rows, locale, canWrite, w, act }: Readonly<{ rows: ConsoleBooking[]; locale: Locale; canWrite: boolean; w: Words; act: Act }>) {
  if (rows.length === 0) return <p className="console-lede">{w('empty')}</p>;
  return (
    <div className="console-table-wrap">
      <table className="console-table">
        <thead>
          <tr>
            <th>{w('when')}</th>
            <th>{w('patient')}</th>
            <th>{w('branch')}</th>
            <th>{w('service')}</th>
            <th>{w('price')}</th>
            <th>{w('status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <BookingRow key={row.id} row={row} locale={locale} canWrite={canWrite} w={w} act={act} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BookingRow({ row, locale, canWrite, w, act }: Readonly<{ row: ConsoleBooking; locale: Locale; canWrite: boolean; w: Words; act: Act }>) {
  const [note, setNote] = useState(row.note);
  const [price, setPrice] = useState(row.price);
  const [busy, setBusy] = useState(false);
  const status = STATUS[row.status] ?? STATUS[1];

  async function save(change: Record<string, unknown>) {
    setBusy(true);
    await act(`/api/console/app/bookings/${row.id}`, 'PATCH', change);
    setBusy(false);
  }

  return (
    <tr>
      <td>
        <strong className="console-app-when" dir="ltr">{row.startAt}{row.endAt ? ` → ${row.endAt.slice(11)}` : ''}</strong>
        <code className="console-app-sub">{row.code}</code>
      </td>
      <td>
        {row.customer.name}
        {row.customer.phone && (
          <span className="console-app-sub">
            <a href={`tel:${row.customer.phone}`} dir="ltr">{row.customer.phone}</a>
            {' · '}
            <a href={`https://wa.me/2${row.customer.phone}`} target="_blank" rel="noreferrer">WhatsApp</a>
          </span>
        )}
        <code className="console-app-sub">{row.customer.code}</code>
      </td>
      <td>{row.branch}</td>
      <td>{row.service}</td>
      <td>
        {canWrite ? (
          <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="console-app-price" aria-label={w('price')} />
        ) : (
          price
        )}
      </td>
      <td>
        <Badge tone={status.tone}>{status[locale]}</Badge>
        {canWrite && (
          <div className="console-app-actions">
            <Select value={String(row.status)} disabled={busy} onChange={(e) => void save({ status: Number(e.target.value), price: price || null })} aria-label={w('status')}>
              {Object.entries(STATUS).map(([code, s]) => (
                <option key={code} value={code}>{s[locale]}</option>
              ))}
            </Select>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={w('note')} aria-label={w('note')} />
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void save({ note, price: price || null })}>{w('save')}</Button>
          </div>
        )}
      </td>
    </tr>
  );
}

function PatientsTable({ rows, canWrite, w, act }: Readonly<{ rows: ConsoleCustomer[]; locale: Locale; canWrite: boolean; w: Words; act: Act }>) {
  if (rows.length === 0) return <p className="console-lede">{w('noPatients')}</p>;
  return (
    <div className="console-table-wrap">
      <table className="console-table">
        <thead>
          <tr>
            <th>{w('patient')}</th>
            <th>{w('points')}</th>
            <th>{w('count')}</th>
            <th>{w('joined')}</th>
            {canWrite && <th>{w('addPoints')}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <PatientRow key={row.id} row={row} canWrite={canWrite} w={w} act={act} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PatientRow({ row, canWrite, w, act }: Readonly<{ row: ConsoleCustomer; canWrite: boolean; w: Words; act: Act }>) {
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function addPoints() {
    const value = Number.parseInt(points, 10);
    if (!Number.isInteger(value) || value === 0) return;
    setBusy(true);
    if (await act(`/api/console/app/customers/${row.id}/points`, 'POST', { points: value, note })) {
      setPoints('');
      setNote('');
    }
    setBusy(false);
  }

  return (
    <tr>
      <td>
        {row.name} {row.blocked && <Badge tone="danger">{w('blocked')}</Badge>}
        {row.phone && <a className="console-app-sub" href={`tel:${row.phone}`} dir="ltr">{row.phone}</a>}
        <code className="console-app-sub">{row.code}</code>
      </td>
      <td><strong>{row.points}</strong></td>
      <td>{row.bookings}</td>
      <td dir="ltr">{row.createdAt.slice(0, 10)}</td>
      {canWrite && (
        <td>
          <div className="console-app-inline">
            <Input value={points} onChange={(e) => setPoints(e.target.value)} inputMode="numeric" placeholder={w('pointsHint')} aria-label={w('points')} />
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={w('note')} aria-label={w('note')} />
            <Button size="sm" variant="primary" disabled={busy || !points} onClick={() => void addPoints()}>{w('save')}</Button>
            <Button
              size="sm"
              variant={row.blocked ? 'default' : 'danger'}
              disabled={busy}
              onClick={() => void act(`/api/console/app/customers/${row.id}`, 'PATCH', { blocked: !row.blocked })}
            >
              {row.blocked ? w('unblock') : w('block')}
            </Button>
          </div>
        </td>
      )}
    </tr>
  );
}

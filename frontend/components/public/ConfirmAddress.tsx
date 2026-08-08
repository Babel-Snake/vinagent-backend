'use client';

import { useEffect, useRef, useState } from 'react';

import {
  buildPublicAddressEndpoint,
  extractActionToken,
  mapAddressActionError,
  normalizeAddress,
  validateAddressForm,
} from '../../lib/publicAddressFlow.mjs';

type AddressField = 'addressLine1' | 'addressLine2' | 'suburb' | 'state' | 'postcode' | 'country';
type Address = Record<AddressField, string>;
type FieldErrors = Partial<Record<AddressField, string>>;
type View =
  | 'loading'
  | 'ready'
  | 'submitting'
  | 'success'
  | 'expired'
  | 'used'
  | 'rate-limited'
  | 'service-error'
  | 'unavailable';

type ValidationResponse = {
  member?: { firstName?: unknown } | null;
  currentAddress?: unknown;
  proposedAddress?: unknown;
  expiresAt?: unknown;
};

type ErrorResponse = {
  error?: {
    code?: unknown;
  };
};

const EMPTY_ADDRESS: Address = {
  addressLine1: '',
  addressLine2: '',
  suburb: '',
  state: '',
  postcode: '',
  country: '',
};

const FIELD_CONFIG: Array<{
  field: AddressField;
  label: string;
  autoComplete: string;
  required?: boolean;
}> = [
  { field: 'addressLine1', label: 'Address line 1', autoComplete: 'address-line1', required: true },
  { field: 'addressLine2', label: 'Address line 2 (optional)', autoComplete: 'address-line2' },
  { field: 'suburb', label: 'Suburb or town', autoComplete: 'address-level2' },
  { field: 'state', label: 'State or territory', autoComplete: 'address-level1' },
  { field: 'postcode', label: 'Postcode', autoComplete: 'postal-code' },
  { field: 'country', label: 'Country', autoComplete: 'country-name' },
];

function safeAddress(value: unknown): Address {
  return normalizeAddress(value) as Address;
}

function parseErrorPayload(value: unknown): ErrorResponse {
  return value && typeof value === 'object' ? (value as ErrorResponse) : {};
}

async function errorFromResponse(response: Response) {
  let payload: ErrorResponse = {};
  try {
    payload = parseErrorPayload(await response.json());
  } catch {
    // The customer-facing state deliberately does not depend on a raw error body.
  }

  const code = typeof payload.error?.code === 'string' ? payload.error.code : undefined;
  return mapAddressActionError(response.status, code);
}

function formattedAddressLines(address: Address) {
  const locality = [address.suburb, address.state, address.postcode].filter(Boolean).join(' ');
  return [address.addressLine1, address.addressLine2, locality, address.country].filter(Boolean);
}

function StatusCard({ view, heading, message }: { view: View; heading: string; message: string }) {
  const isSuccess = view === 'success';
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10">
      <section
        className="surface-panel w-full max-w-lg p-6 text-center sm:p-8"
        aria-live="polite"
        data-testid={`confirm-address-${view}`}
      >
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold ${
            isSuccess
              ? 'bg-[var(--success-soft)] text-[var(--success)]'
              : 'bg-[var(--brand-soft)] text-[var(--brand)]'
          }`}
          aria-hidden="true"
        >
          {isSuccess ? '✓' : '!'}
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[#1c231f]">{heading}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{message}</p>
        <p className="mt-6 text-xs text-[var(--muted)]">You can close this window.</p>
      </section>
    </main>
  );
}

export default function ConfirmAddress() {
  const tokenRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const [view, setView] = useState<View>('loading');
  const [firstName, setFirstName] = useState('');
  const [currentAddress, setCurrentAddress] = useState<Address>(EMPTY_ADDRESS);
  const [form, setForm] = useState<Address>(EMPTY_ADDRESS);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirmed, setConfirmed] = useState(false);
  const [statusCopy, setStatusCopy] = useState({ heading: '', message: '' });

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    let active = true;

    async function validateToken() {
      let token = tokenRef.current;
      if (!token) {
        token = extractActionToken(window.location.href);
        tokenRef.current = token;
        window.history.replaceState(null, document.title, window.location.pathname);
      }

      if (!token) {
        const state = mapAddressActionError(400, 'INVALID_TOKEN');
        setStatusCopy(state);
        setView(state.view as View);
        window.clearTimeout(timeout);
        return;
      }

      try {
        const response = await fetch(
          buildPublicAddressEndpoint(process.env.NEXT_PUBLIC_API_URL, 'validate'),
          {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: controller.signal,
          },
        );

        if (!active) return;
        if (!response.ok) {
          const state = await errorFromResponse(response);
          tokenRef.current = null;
          setStatusCopy(state);
          setView(state.view as View);
          return;
        }

        const payload = (await response.json()) as ValidationResponse;
        const proposed = safeAddress(payload.proposedAddress);
        const current = safeAddress(payload.currentAddress);
        const name = typeof payload.member?.firstName === 'string' ? payload.member.firstName.trim() : '';
        const expiry = typeof payload.expiresAt === 'string' && !Number.isNaN(Date.parse(payload.expiresAt))
          ? payload.expiresAt
          : null;

        setFirstName(name);
        setCurrentAddress(current);
        setForm(proposed.addressLine1 ? proposed : current);
        setExpiresAt(expiry);
        setView('ready');
      } catch {
        if (!active) return;
        const state = mapAddressActionError(0);
        setStatusCopy(state);
        setView(state.view as View);
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void validateToken();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  function updateField(field: AddressField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setConfirmed(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (view !== 'ready' || !tokenRef.current || submittingRef.current) return;

    const errors = validateAddressForm(form) as FieldErrors;
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstError = FIELD_CONFIG.find(({ field }) => errors[field]);
      window.requestAnimationFrame(() => document.getElementById(firstError?.field || '')?.focus());
      return;
    }

    if (!confirmed) return;
    submittingRef.current = true;
    setView('submitting');

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(
        buildPublicAddressEndpoint(process.env.NEXT_PUBLIC_API_URL, 'confirm'),
        {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenRef.current, newAddress: form }),
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const state = await errorFromResponse(response);
        tokenRef.current = null;
        setStatusCopy(state);
        setView(state.view as View);
        return;
      }

      tokenRef.current = null;
      setForm(EMPTY_ADDRESS);
      setCurrentAddress(EMPTY_ADDRESS);
      setView('success');
    } catch {
      const state = mapAddressActionError(0);
      setStatusCopy(state);
      setView(state.view as View);
    } finally {
      submittingRef.current = false;
      window.clearTimeout(timeout);
    }
  }

  if (view === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10" aria-busy="true">
        <div className="text-center" role="status">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[#d9dfd2] border-t-[var(--brand)]" />
          <p className="mt-4 text-sm text-[var(--muted)]">Checking your secure link…</p>
        </div>
      </main>
    );
  }

  if (view === 'success') {
    return (
      <StatusCard
        view={view}
        heading="Address updated"
        message="Thank you. Your new address has been confirmed securely."
      />
    );
  }

  if (view !== 'ready' && view !== 'submitting') {
    return <StatusCard view={view} heading={statusCopy.heading} message={statusCopy.message} />;
  }

  const currentLines = formattedAddressLines(currentAddress);
  const expiryLabel = expiresAt
    ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(expiresAt))
    : null;

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-[var(--brand)] text-sm font-bold text-white" aria-hidden="true">
            VA
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[#1c231f] sm:text-3xl">
            {firstName ? `${firstName}, confirm your address` : 'Confirm your address'}
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
            Review the proposed address and correct anything that is not right before confirming.
          </p>
        </header>

        <section className="surface-panel mt-7 overflow-hidden" aria-labelledby="address-form-heading">
          <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4 sm:px-7">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Current address</p>
            {currentLines.length ? (
              <address className="mt-2 text-sm not-italic leading-6 text-[#344039]">
                {currentLines.map((line, index) => <span className="block" key={`${index}-${line}`}>{line}</span>)}
              </address>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">No current address is recorded.</p>
            )}
          </div>

          <form className="space-y-5 px-5 py-6 sm:px-7" onSubmit={submit} noValidate aria-busy={view === 'submitting'}>
            <div>
              <h2 id="address-form-heading" className="text-lg font-semibold text-[#1c231f]">New address</h2>
              {expiryLabel && <p className="mt-1 text-xs text-[var(--muted)]">This secure link expires {expiryLabel}.</p>}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {FIELD_CONFIG.map(({ field, label, autoComplete, required }) => {
                const wide = field === 'addressLine1' || field === 'addressLine2' || field === 'country';
                const error = fieldErrors[field];
                return (
                  <div className={wide ? 'sm:col-span-2' : ''} key={field}>
                    <label className="block text-sm font-medium text-[#344039]" htmlFor={field}>
                      {label}
                    </label>
                    <input
                      id={field}
                      name={field}
                      className={`mt-2 min-h-11 w-full rounded-md border bg-white px-3 py-2 text-base text-[#1c231f] shadow-sm outline-none transition sm:text-sm ${
                        error
                          ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-4 focus:ring-red-100'
                          : 'border-[#ccd5c7] focus:border-[var(--accent)] focus:ring-4 focus:ring-teal-100'
                      }`}
                      value={form[field]}
                      onChange={(event) => updateField(field, event.target.value)}
                      autoComplete={autoComplete}
                      required={required}
                      maxLength={255}
                      disabled={view === 'submitting'}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? `${field}-error` : undefined}
                    />
                    {error && <p className="mt-1 text-sm text-[var(--danger)]" id={`${field}-error`}>{error}</p>}
                  </div>
                );
              })}
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[#344039]">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                disabled={view === 'submitting'}
              />
              <span>I confirm this is the address I want the winery to keep on my account.</span>
            </label>

            <button
              type="submit"
              className="min-h-12 w-full rounded-md bg-[var(--brand)] px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[var(--brand-strong)] disabled:bg-[#aeb6ab]"
              disabled={!confirmed || view === 'submitting'}
            >
              {view === 'submitting' ? 'Confirming securely…' : 'Confirm address update'}
            </button>

            <p className="text-center text-xs leading-5 text-[var(--muted)]">
              This link can only be used once. If you did not request this change, close this page and contact the winery.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}

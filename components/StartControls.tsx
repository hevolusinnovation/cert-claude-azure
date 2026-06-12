'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DOMAINS, SINGLE_DOMAIN_QUESTIONS } from '@/lib/domains';
import type { DomainCode } from '@/lib/types';

export default function StartControls() {
  const router = useRouter();
  const [domain, setDomain] = useState<DomainCode>(DOMAINS[0].code);
  const [busy, setBusy] = useState<'full' | 'domain' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (mode: 'full' | 'domain') => {
    setBusy(mode);
    setError(null);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'full' ? { mode } : { mode, domain }),
      });
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (res.status === 401) {
        router.push('/login?next=/profile');
        return;
      }
      if (!res.ok || !data.id) {
        setError((data.error as string) || 'Could not start the exam. Try again.');
        return;
      }
      router.push(`/exam?session=${data.id}`);
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="start-grid">
      <div className="card start-card">
        <h3 className="serif">Full mock</h3>
        <p className="muted">
          60 questions across all five domains (weighted toward Domain 1), with a 120-minute
          countdown.
        </p>
        <button className="btn" onClick={() => start('full')} disabled={busy !== null} type="button">
          {busy === 'full' ? 'Starting…' : 'Start full mock'}
        </button>
      </div>

      <div className="card start-card">
        <h3 className="serif">Single domain</h3>
        <p className="muted">
          {SINGLE_DOMAIN_QUESTIONS} questions focused on one domain. No timer — drill at your own
          pace.
        </p>
        <label className="field-label" htmlFor="domain-select">
          Domain
        </label>
        <select
          id="domain-select"
          className="select"
          value={domain}
          onChange={(e) => setDomain(e.target.value as DomainCode)}
        >
          {DOMAINS.map((d) => (
            <option key={d.code} value={d.code}>
              {d.code} — {d.name}
            </option>
          ))}
        </select>
        <button
          className="btn btn-secondary"
          onClick={() => start('domain')}
          disabled={busy !== null}
          type="button"
        >
          {busy === 'domain' ? 'Starting…' : 'Start domain set'}
        </button>
      </div>

      {error && <p className="auth-error start-error">{error}</p>}
    </div>
  );
}

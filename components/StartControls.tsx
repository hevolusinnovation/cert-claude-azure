'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DOMAINS, SINGLE_DOMAIN_QUESTIONS } from '@/lib/domains';
import { STORAGE_KEY } from '@/lib/storage';
import type { DomainCode } from '@/lib/types';

export default function StartControls() {
  const router = useRouter();
  const [domain, setDomain] = useState<DomainCode>(DOMAINS[0].code);

  const start = (path: string) => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore — a missing localStorage just means no resume state to clear
    }
    router.push(path);
  };

  return (
    <div className="start-grid">
      <div className="card start-card">
        <h3 className="serif">Full mock</h3>
        <p className="muted">
          60 questions across all five domains (weighted toward Domain 1), with a 120-minute
          countdown.
        </p>
        <button className="btn" onClick={() => start('/exam?mode=full')}>
          Start full mock
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
          onClick={() => start(`/exam?mode=domain&domain=${domain}`)}
        >
          Start domain set
        </button>
      </div>
    </div>
  );
}

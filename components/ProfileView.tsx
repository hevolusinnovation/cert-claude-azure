'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { DOMAINS, DOMAIN_MAP } from '@/lib/domains';
import { PASS_BAR, scaledScore } from '@/lib/score';
import type { DomainCode, SessionSummary, UserStats } from '@/lib/types';
import UserMenu from './UserMenu';

function modeLabel(s: SessionSummary): string {
  if (s.mode === 'full') return 'Full mock';
  return `Single domain · ${s.singleDomain ?? ''}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function ProfileView({
  username,
  sessions,
  stats,
}: {
  username: string;
  sessions: SessionSummary[];
  stats: UserStats;
}) {
  const inProgress = sessions.filter((s) => !s.finished);
  const completed = sessions.filter((s) => s.finished);

  return (
    <main className="container">
      <div className="profile-header">
        <div>
          <span className="pill-tag">Profile</span>
          <h1 className="serif">Hi, {username}</h1>
        </div>
        <UserMenu username={username} />
      </div>

      <div className="actions profile-actions">
        <Link className="btn" href="/#start">
          New exam
        </Link>
      </div>

      <StatsPanel stats={stats} />

      <CoachPanel hasData={stats.finishedSessions >= 1} />

      <section className="card">
        <h2 className="serif">In progress</h2>
        {inProgress.length === 0 ? (
          <p className="muted small">No exams in progress. Start a new one above.</p>
        ) : (
          <div className="session-list">
            {inProgress.map((s) => (
              <SessionRow key={s.id} s={s} />
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="serif">Completed</h2>
        {completed.length === 0 ? (
          <p className="muted small">No completed exams yet.</p>
        ) : (
          <div className="session-list">
            {completed.map((s) => (
              <SessionRow key={s.id} s={s} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function SessionRow({ s }: { s: SessionSummary }) {
  const scaled =
    s.finished && s.scoreTotal && s.scoreTotal > 0
      ? scaledScore(s.scoreCorrect ?? 0, s.scoreTotal)
      : null;
  const passed = scaled !== null && scaled >= PASS_BAR;

  return (
    <div className="session-row">
      <div className="session-main">
        <strong>{modeLabel(s)}</strong>
        <span className="muted small">
          {fmtDate(s.updatedAt)} · {s.answered}/{s.plannedTotal} answered
        </span>
      </div>
      <div className="session-side">
        {scaled !== null && (
          <span className={`verdict-mini ${passed ? 'pass' : 'fail'}`}>
            {scaled} · {passed ? 'PASS' : 'BELOW'}
          </span>
        )}
        <Link className="btn btn-secondary" href={`/exam?session=${s.id}`}>
          {s.finished ? 'See results' : 'Resume'}
        </Link>
      </div>
    </div>
  );
}

function StatsPanel({ stats }: { stats: UserStats }) {
  const answeredDomains = (Object.keys(stats.perDomain) as DomainCode[]).filter(
    (d) => (stats.perDomain[d]?.total ?? 0) > 0,
  );

  return (
    <section className="card">
      <h2 className="serif">Your performance</h2>
      <div className="stat-strip profile-stats">
        <div className="stat">
          <span className="stat-num">{stats.finishedSessions}</span>
          <span className="stat-label">exams completed</span>
        </div>
        <div className="stat">
          <span className="stat-num">{stats.passedCount}</span>
          <span className="stat-label">above the 720 bar</span>
        </div>
        <div className="stat">
          <span className="stat-num">{stats.avgScaled ?? '—'}</span>
          <span className="stat-label">avg scaled score</span>
        </div>
        <div className="stat">
          <span className="stat-num">{stats.bestScaled ?? '—'}</span>
          <span className="stat-label">best scaled score</span>
        </div>
      </div>

      {answeredDomains.length > 0 && (
        <div className="domain-rows profile-domains">
          {DOMAINS.map((d) => {
            const s = stats.perDomain[d.code];
            const acc = s && s.total > 0 ? s.correct / s.total : null;
            return (
              <div className="domain-row" key={d.code}>
                <div className="domain-row-head">
                  <span>
                    <strong>{d.code}</strong> · {d.name}
                  </span>
                  <span className="muted small">
                    {acc !== null ? `${s!.correct}/${s!.total} · ${Math.round(acc * 100)}%` : '—'}
                  </span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${acc !== null ? Math.round(acc * 100) : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CoachPanel({ hasData }: { hasData: boolean }) {
  const [report, setReport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/stats/interpretation', { method: 'POST' });
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) {
        setError((data.error as string) || 'Could not generate the analysis.');
        return;
      }
      setReport(data.interpretation as string);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card coach-card">
      <h2 className="serif">AI performance coach</h2>
      <p className="muted small">
        Claude reads your stats and tells you which domains and topics to focus on next.
      </p>
      {!hasData ? (
        <p className="muted small">Finish at least one exam to unlock the AI analysis.</p>
      ) : (
        <>
          <button className="btn" onClick={analyze} disabled={busy} type="button">
            {busy ? 'Analyzing…' : report ? 'Re-analyze' : 'Analyze my performance'}
          </button>
          {error && <p className="auth-error">{error}</p>}
          {report && <MarkdownLite text={report} />}
        </>
      )}
    </section>
  );
}

/** Minimal, dependency-free, XSS-safe Markdown renderer for the coach report. */
function MarkdownLite({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (list.length) {
      out.push(
        <ul key={key}>
          {list.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^#{1,6}\s/.test(line)) {
      flushList(`l${i}`);
      const level = line.match(/^#+/)![0].length;
      const content = inline(line.replace(/^#{1,6}\s/, ''));
      out.push(level <= 2 ? <h3 key={i}>{content}</h3> : <h4 key={i}>{content}</h4>);
    } else if (/^[-*]\s/.test(line)) {
      list.push(line.replace(/^[-*]\s/, ''));
    } else if (line.trim() === '') {
      flushList(`l${i}`);
    } else {
      flushList(`l${i}`);
      out.push(<p key={i}>{inline(line)}</p>);
    }
  });
  flushList('last');

  return <div className="coach-report">{out}</div>;
}

/** Renders **bold** segments; everything else is plain text (no HTML injected). */
function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

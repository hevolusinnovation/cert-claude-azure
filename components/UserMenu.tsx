'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function UserMenu({ username }: { username: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="user-menu">
      <Link href="/profile" className="user-name">
        {username}
      </Link>
      <button className="link-btn" onClick={logout} disabled={busy} type="button">
        Log out
      </button>
    </div>
  );
}

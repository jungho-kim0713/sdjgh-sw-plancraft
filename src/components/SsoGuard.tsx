'use client';

import { useEffect, useState } from 'react';

const PLATFORM_ORIGIN = 'https://platform.sdjgh-ai.kr';
const VERIFY_URL = `${PLATFORM_ORIGIN}/api/auth/verify`;

let ssoToken: string | null = null;

export function getSsoToken() {
  return ssoToken;
}

type Status = 'skipped' | 'pending' | 'verified' | 'expired';

export default function SsoGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('pending');

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      setStatus('skipped');
      return;
    }

    const embedded = window.self !== window.top;
    if (!embedded) {
      window.location.replace(PLATFORM_ORIGIN);
      return;
    }

    let settled = false;

    function fail() {
      if (settled) return;
      settled = true;
      setStatus('expired');
      window.parent.postMessage({ type: 'sso:expired' }, PLATFORM_ORIGIN);
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== PLATFORM_ORIGIN || event.source !== window.parent) return;
      const data = event.data as { type?: string; token?: string };
      if (data?.type !== 'sso:token' || !data.token) return;

      fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: data.token }),
      })
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((result: { valid?: boolean }) => {
          if (!result?.valid || settled) return;
          settled = true;
          ssoToken = data.token as string;
          setStatus('verified');
        })
        .catch(fail);
    }

    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'sso:ready' }, PLATFORM_ORIGIN);

    const timeout = setTimeout(fail, 8000);

    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timeout);
    };
  }, []);

  if (status === 'pending') {
    return <div style={overlayStyle}>연결 확인 중...</div>;
  }
  if (status === 'expired') {
    return <div style={overlayStyle}>세션이 만료됐어요. 스마트 캠퍼스에서 다시 접속해 주세요.</div>;
  }
  return <>{children}</>;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#fff',
  fontSize: '1rem',
  color: '#333',
  zIndex: 9999,
};

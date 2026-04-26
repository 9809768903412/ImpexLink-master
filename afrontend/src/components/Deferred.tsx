import { ReactNode, useEffect, useState } from 'react';

export function Deferred({ children, delay = 250 }: { children: ReactNode; delay?: number }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  if (!ready) return null;
  return <>{children}</>;
}

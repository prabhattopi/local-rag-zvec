'use client';

import { DesktopDBProvider } from 'use-desktop-db';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DesktopDBProvider>
      {children}
    </DesktopDBProvider>
  );
}

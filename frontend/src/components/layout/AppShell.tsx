import React from 'react';
import { Header } from './Header';
import { StatusBar } from './StatusBar';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      width: '100vw',
      background: 'var(--color-bg)',
    }}>
      <Header />
      <main style={{
        flex: 1,
        paddingTop: 64, /* header height */
      }}>
        {children}
      </main>
      <StatusBar />
    </div>
  );
};

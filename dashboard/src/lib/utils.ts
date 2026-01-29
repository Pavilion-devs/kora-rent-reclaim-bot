// Utility functions for the dashboard

export const LAMPORTS_PER_SOL = 1_000_000_000;

export function formatLamports(lamports: number): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  return formatAmount(sol, 4);
}

export function formatAmount(amount: number, decimals: number = 4): string {
  if (amount === 0) return '0';
  if (amount < 0.0001) return '<0.0001';
  return amount.toFixed(decimals).replace(/\.?0+$/, '');
}

export function truncateAddress(address: string, startLen: number = 6, endLen: number = 4): string {
  if (!address || address.length <= startLen + endLen) return address;
  return `${address.slice(0, startLen)}...${address.slice(-endLen)}`;
}

export function formatTimeAgo(timestamp: string | number): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function formatDate(timestamp: string | number): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

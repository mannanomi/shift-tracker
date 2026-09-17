export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);
}

export function formatHours(hours: number): string {
  return `${hours.toFixed(2)}h`;
}

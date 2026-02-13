const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function formatCurrency(value: number | null, nullDisplay = 'N/A'): string {
  if (value === null) return nullDisplay
  return currencyFormatter.format(value)
}

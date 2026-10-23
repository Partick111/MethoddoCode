export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

/** 千分位格式化 */
export function thousandsSeparator(value: number | string): string {
  return Number(value).toLocaleString('en-US')
}

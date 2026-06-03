export type DebouncedFunction<T extends (...args: never[]) => void> = T & {
  cancel: () => void;
};

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  waitMs: number,
): DebouncedFunction<T> {
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;

  const debounced = ((...args: Parameters<T>) => {
    if (timer !== undefined) {
      globalThis.clearTimeout(timer);
    }
    timer = globalThis.setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, waitMs);
  }) as DebouncedFunction<T>;

  debounced.cancel = () => {
    if (timer !== undefined) {
      globalThis.clearTimeout(timer);
      timer = undefined;
    }
  };

  return debounced;
}

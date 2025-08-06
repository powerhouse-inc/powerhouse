export function debounce<T extends unknown[], R>(
  func: (...args: T) => Promise<R>,
  delay = 250,
) {
  let timer: number;
  return (immediate = false, ...args: T) => {
    if (timer) {
      clearTimeout(timer);
    }
    return new Promise<R>((resolve, reject) => {
      if (immediate) {
        func(...args)
          .then(resolve)
          .catch(reject);
      } else {
        timer = setTimeout(() => {
          func(...args)
            .then(resolve)
            .catch(reject);
        }, delay) as unknown as number;
      }
    });
  };
}

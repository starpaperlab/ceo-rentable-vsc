export function createAutosaveQueue() {
  const timers = new Map();

  return {
    schedule(key, callback, delay) {
      this.cancel(key);
      const timerId = window.setTimeout(async () => {
        timers.delete(key);
        await callback();
      }, delay);
      timers.set(key, timerId);
    },

    cancel(key) {
      const timerId = timers.get(key);
      if (timerId) {
        window.clearTimeout(timerId);
        timers.delete(key);
      }
    },

    cancelAll() {
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
    },

    has(key) {
      return timers.has(key);
    },
  };
}


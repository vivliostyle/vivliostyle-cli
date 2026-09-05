interface Destroyable {
  destroy(): void;
}

export function disposable<T extends Destroyable>(obj: T): T & Disposable {
  return Object.assign(obj, {
    [Symbol.dispose]() {
      obj.destroy();
    },
  });
}

export function disposableOrNull<T extends Destroyable>(
  obj: T | null,
): (T & Disposable) | null {
  return obj && disposable(obj);
}

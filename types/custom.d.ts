declare type Without<T> = { [P in keyof T]?: never };
type Tail<T extends unknown[]> = T extends [unknown, ...infer XS] ? XS : never;
type Union<T extends unknown[]> = T extends []
  ? unknown
  : T[0] & Union<Tail<T>>;
declare type XOR<T extends unknown[], U extends unknown[] = []> = T extends []
  ? never
  : (T[0] & Without<Union<[...U, ...Tail<T>]>>) | XOR<Tail<T>, [T[0], ...U]>;
declare type Resolved<T> = T extends Promise<infer U> ? U : never;

interface ImportMeta {
  env?: Record<string, unknown>;
}

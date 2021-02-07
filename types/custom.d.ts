declare module 'hastscript';

declare type Without<T> = { [P in keyof T]?: never };
type Tail<T extends any[]> = T extends [any, ...infer XS] ? XS : never;
type Union<T extends any[]> = T extends [] ? {} : T[0] & Union<Tail<T>>;
declare type XOR<T extends any[], U extends any[] = []> = T extends []
  ? never
  : (T[0] & Without<Union<[...U, ...Tail<T>]>>) | XOR<Tail<T>, [T[0], ...U]>;
declare type Resolved<T> = T extends Promise<infer U> ? U : never;

declare module 'hastscript';

declare type Without<T> = { [P in keyof T]?: never };
declare type XOR<T, U> = (Without<T> & U) | (Without<U> & T);

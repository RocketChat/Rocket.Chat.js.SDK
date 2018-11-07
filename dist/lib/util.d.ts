/** A function that emits a side effect and does not return anything. */
export declare type Procedure = (...args: any[]) => void;
/** Delay invocation of a function until some time after it was last called */
export declare function debounce<F extends Procedure>(func: F, waitMilliseconds?: number, immediate?: boolean): F;
/** Convert a http/s protocol address to a websocket URL */
export declare function hostToWS(host: string, ssl?: boolean): string;

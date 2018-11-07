/**
 * @module log
 * Basic log handling with ability to override when used within another module.
 */
import { ILogger } from '../interfaces';
/** Default basic console logging */
export declare let logger: ILogger;
/** Substitute logging handler */
export declare function replaceLog(externalLog: ILogger): void;
/** Null all log outputs */
export declare function silence(): void;

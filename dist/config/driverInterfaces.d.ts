/**
 * Connection options type
 * @param host        Rocket.Chat instance Host URL:PORT (without protocol)
 * @param timeout     How long to wait (ms) before abandoning connection
 */
export interface IConnectOptions {
    host?: string;
    useSsl?: boolean;
    timeout?: number;
    integration?: string;
}
/**
 * Message respond options
 * @param rooms       Respond to only selected room/s (names or IDs)
 * @param allPublic   Respond on all public channels (ignores rooms if true)
 * @param dm          Respond to messages in DM / private chats
 * @param livechat    Respond to messages in livechat
 * @param edited      Respond to edited messages
 */
export interface IRespondOptions {
    rooms?: string[];
    allPublic?: boolean;
    dm?: boolean;
    livechat?: boolean;
    edited?: boolean;
}
/**
 * Loggers need to provide the same set of methods
 */
export interface ILogger {
    debug: (...args: any[]) => void;
    info: (...args: any[]) => void;
    warning: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
}
/**
 * Error-first callback param type
 */
export interface ICallback {
    (error: Error | null, ...args: any[]): void;
}

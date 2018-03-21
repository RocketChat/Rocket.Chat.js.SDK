import { ILogger } from '../config/driverInterfaces';
declare let logger: ILogger;
declare function replaceLog(externalLog: ILogger): void;
declare function silence(): void;
export { logger, replaceLog, silence };

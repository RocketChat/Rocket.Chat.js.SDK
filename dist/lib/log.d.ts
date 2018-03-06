import { ILogger } from '../config/driverInterfaces';
declare let logger: ILogger;
declare function replaceLog(externalLog: ILogger): void;
export { logger, replaceLog };

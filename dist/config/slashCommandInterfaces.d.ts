import { IMessage } from './messageInterfaces';
export interface ISlashCommand {
    cmd: string;
    params?: any;
    msg?: IMessage;
}

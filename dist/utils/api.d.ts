import { INewUserAPI, ILoginResultAPI } from './interfaces';
export declare const api: any;
export declare const handle: (err: any) => never;
export declare function setAuth(authData: {
    authToken: string;
    userId: string;
}): void;
export declare function getHeaders(authRequired?: boolean): {
    'Content-Type': string;
};
export declare function post(endpoint: string, data: any, auth?: boolean, ignore?: RegExp): Promise<any>;
export declare function get(endpoint: string, auth: boolean): Promise<any>;
export declare function login(user: INewUserAPI): Promise<ILoginResultAPI | undefined>;
export declare function logout(): Promise<any>;

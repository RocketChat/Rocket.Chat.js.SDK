export declare const api: any;
export declare const handle: (err: Error) => void;
export declare function setAuth(authData: {
    authToken: string;
    userId: string;
}): void;
export declare function getHeaders(authRequired?: boolean): {
    'Content-Type': string;
};
export declare function post(endpoint: string, data: any, auth?: boolean): Promise<any>;
export declare function get(endpoint: string, auth: boolean): Promise<any>;

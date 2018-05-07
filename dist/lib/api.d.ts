/** Result object from an API login */
export interface ILoginResultAPI {
    status: string;
    data: {
        authToken: string;
        userId: string;
    };
}
/** Structure for passing and keeping login credentials */
export interface ILoginCredentials {
    username: string;
    password: string;
}
export declare let currentLogin: {
    username: string;
    userId: string;
    authToken: string;
    result: ILoginResultAPI;
} | null;
/** Check for existing login */
export declare function loggedIn(): boolean;
/** Initialise client and configs */
export declare const client: any;
export declare const host: string;
/**
 * Prepend protocol (or put back if removed from env settings for driver)
 * Hard code endpoint prefix, because all syntax depends on this version
 */
export declare const url: string;
/** Convert payload data to query string for GET requests */
export declare function getQueryString(data: any): string;
/** Setup default headers with empty auth for now */
export declare const basicHeaders: {
    'Content-Type': string;
};
export declare const authHeaders: {
    'X-Auth-Token': string;
    'X-User-Id': string;
};
/** Populate auth headers (from response data on login) */
export declare function setAuth(authData: {
    authToken: string;
    userId: string;
}): void;
/** Join basic headers with auth headers if required */
export declare function getHeaders(authRequired?: boolean): {
    'Content-Type': string;
};
/** Clear headers so they can't be used without logging in again */
export declare function clearHeaders(): void;
/** Check result data for success, allowing override to ignore some errors */
export declare function success(result: any, ignore?: RegExp): boolean;
/**
 * Do a POST request to an API endpoint.
 * If it needs a token, login first (with defaults) to set auth headers.
 * @todo Look at why some errors return HTML (caught as buffer) instead of JSON
 * @param endpoint The API endpoint (including version) e.g. `chat.update`
 * @param data     Payload for POST request to endpoint
 * @param auth     Require auth headers for endpoint, default true
 * @param ignore   Allows certain matching error messages to not count as errors
 */
export declare function post(endpoint: string, data: any, auth?: boolean, ignore?: RegExp): Promise<any>;
/**
 * Do a GET request to an API endpoint
 * @param endpoint   The API endpoint (including version) e.g. `users.info`
 * @param data       Object to serialise for GET request query string
 * @param auth       Require auth headers for endpoint, default true
 * @param ignore     Allows certain matching error messages to not count as errors
 */
export declare function get(endpoint: string, data?: any, auth?: boolean, ignore?: RegExp): Promise<any>;
/**
 * Login a user for further API calls
 * Result should come back with a token, to authorise following requests.
 * Use env default credentials, unless overridden by login arguments.
 */
export declare function login(user?: ILoginCredentials): Promise<ILoginResultAPI>;
/** Logout a user at end of API calls */
export declare function logout(): Promise<void>;
/** Defaults for user queries */
export declare const userFields: {
    name: number;
    username: number;
    status: number;
    type: number;
};
/** Query helpers for user collection requests */
export declare const users: any;

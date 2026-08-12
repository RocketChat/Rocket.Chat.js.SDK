// The consuming app assigns this binding and the SDK reads it back through the
// module namespace, so both the `let` and the wide type are load-bearing: the app
// assigns an interface-typed object, which no index signature would accept.
export let customHeaders = {};

/**
 * 2024 Native Signals <noamlin@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
export declare const ND: unique symbol;
export declare const NID: unique symbol;
export declare const proxyTypes: {
    Object: boolean;
    Array: boolean;
};
export declare enum NODE_STATUSES {
    active = "active",
    stopped = "stopped",
    blocked = "blocked",
    splicing = "splicing"
}
export declare enum PROXY_STATUSES {
    alive = "alive",
    deleted = "deleted",
    revoked = "revoked"
}
export declare enum EVENTS {
    create = "create",
    update = "update",
    delete = "delete",
    splice = "splice",
    shift = "shift",
    unshift = "unshift"
}

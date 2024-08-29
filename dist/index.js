/**
 * 2024 Native Signals <noamlin@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
const ND = Symbol.for("proxserve_node_data"); // key for the data of a node
const NID = Symbol.for("proxserve_node_inherited_data"); // key for the inherited data of a node
// statuses of data-nodes
var NODE_STATUSES;
(function (NODE_STATUSES) {
    NODE_STATUSES["active"] = "active";
    NODE_STATUSES["stopped"] = "stopped";
    NODE_STATUSES["blocked"] = "blocked";
    NODE_STATUSES["splicing"] = "splicing";
})(NODE_STATUSES || (NODE_STATUSES = {}));
// statuses of proxies
var PROXY_STATUSES;
(function (PROXY_STATUSES) {
    PROXY_STATUSES["alive"] = "alive";
    PROXY_STATUSES["deleted"] = "deleted";
    PROXY_STATUSES["revoked"] = "revoked";
})(PROXY_STATUSES || (PROXY_STATUSES = {}));
// event names that can be emitted
var EVENTS;
(function (EVENTS) {
    EVENTS["create"] = "create";
    EVENTS["update"] = "update";
    EVENTS["delete"] = "delete";
    EVENTS["splice"] = "splice";
    EVENTS["shift"] = "shift";
    EVENTS["unshift"] = "unshift";
})(EVENTS || (EVENTS = {}));

/**
 * 2024 Native Signals <noamlin@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
/**
 * return a string representing the full type of the variable
 */
function realtypeof(variable) {
    const rawType = Object.prototype.toString.call(variable); //[object Object], [object Array], [object Number]...
    return rawType.substring(8, rawType.length - 1);
}
/**
 * splits a path to an array of properties
 * (benchmarked and is faster than regex and split())
 * @param path
 */
function splitPath(path) {
    if (typeof path !== "string" || path === "") {
        return [];
    }
    let i = 0;
    let isBetweenBrackets = false;
    let isOnlyDigits = false;
    //loop will skip over openning '.' or '['
    if (path[0] === ".") {
        i = 1;
    }
    else if (path[0] === "[") {
        i = 1;
        isBetweenBrackets = true;
        isOnlyDigits = true;
    }
    const resultsArr = [];
    let tmp = "";
    for (; i < path.length; i++) {
        const char = path[i];
        if (isBetweenBrackets) {
            if (char === "]") {
                if (isOnlyDigits) {
                    resultsArr.push(Number.parseInt(tmp, 10));
                }
                else {
                    resultsArr.push(tmp);
                }
                isBetweenBrackets = false;
                isOnlyDigits = false;
                tmp = "";
            }
            else {
                if (isOnlyDigits) {
                    const code = char.charCodeAt(0);
                    if (code < 48 || code > 57) {
                        //less than '0' char or greater than '9' char
                        isOnlyDigits = false;
                    }
                }
                tmp += char;
            }
        }
        else {
            if (char === "[") {
                isBetweenBrackets = true;
                isOnlyDigits = true;
            }
            //check if starting a new property but avoid special case of [prop][prop]
            if (char === "." || char === "[") {
                if (tmp !== "") {
                    resultsArr.push(tmp);
                    tmp = "";
                }
            }
            else {
                tmp += char;
            }
        }
    }
    if (tmp !== "") {
        resultsArr.push(tmp);
    }
    return resultsArr;
}

/**
 * 2024 Native Signals <noamlin@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
// Pseudo methods are methods that aren't really on the object - not as a property nor via its prototype
// thus they will not be retrieved via "for..in" and etcetera. Their property name is actually undefined, but
// calling it will return the method via the JS proxy's "get" handler.
// (i.e. someProxserve.pseudoFunction will return the pseudoFunction)
const stop = function stop() {
    this.dataNode[NID].status = NODE_STATUSES.stopped;
};
const block = function block() {
    this.dataNode[NID].status = NODE_STATUSES.blocked;
};
const activate = function activate(force = false) {
    if (force || this.dataNode === this.metadata.dataTree) {
        // force activation or we are on root proxy
        this.dataNode[NID].status = NODE_STATUSES.active;
    }
    else {
        delete this.dataNode[NID].status;
    }
};
const on = function on(args) {
    const { path = "", listener, id, deep = false, once = false } = args;
    // its nicer to expose `event` to the user,
    // but since it is semi-reserved word, we internally rename it to `events`
    let { event: events } = args;
    if (events === "change") {
        events = Object.keys(EVENTS); // will listen to all events
    }
    else if (!Array.isArray(events)) {
        events = [events];
    }
    for (const event of events) {
        if (!EVENTS[event]) {
            const names = Object.keys(EVENTS);
            throw new Error(`${event} is not a valid event. valid events are ${names.join(",")}`);
        }
    }
    let dataNode = this.dataNode;
    const segments = splitPath(path);
    for (const property of segments) {
        // traverse down the tree
        if (!dataNode[property]) {
            // create data-nodes if needed (in dataNode[property]), but don't create/overwrite proxy-nodes
            createNodes(dataNode, property);
        }
        dataNode = dataNode[property];
    }
    let listenersPool = dataNode[ND].listeners.shallow;
    if (deep) {
        listenersPool = dataNode[ND].listeners.deep;
    }
    const listenerObj = {
        type: events,
        once,
        func: listener,
    };
    if (id !== undefined) {
        listenerObj.id = id;
    }
    listenersPool.push(listenerObj);
};
const once = function once(args) {
    args.once = true;
    on.call(this, args);
};
function removeById(listenersArr, 
// biome-ignore lint/complexity/noBannedTypes: <explanation>
id) {
    for (let i = listenersArr.length - 1; i >= 0; i--) {
        const listenerObj = listenersArr[i];
        if ((id !== undefined && listenerObj.id === id) ||
            listenerObj.func === id) {
            listenersArr.splice(i, 1);
        }
    }
}
const removeListener = function removeListener(args) {
    const { id, path = "" } = args;
    const fullPath = `${this.dataNode[ND].path}${path}`;
    let dataNode = this.dataNode;
    const segments = splitPath(path);
    // traverse down the tree
    for (const property of segments) {
        if (!dataNode[property]) {
            console.warn(`can't remove listener from a non-existent path '${fullPath}'`);
            return;
        }
        dataNode = dataNode[property];
    }
    removeById(dataNode[ND].listeners.shallow, id);
    removeById(dataNode[ND].listeners.deep, id);
};
const removeAllListeners = function removeAllListeners(path = "") {
    const fullPath = `${this.dataNode[ND].path}${path}`;
    const segments = splitPath(path);
    let dataNode = this.dataNode;
    //traverse down the tree
    for (const property of segments) {
        if (!dataNode[property]) {
            console.warn(`can't remove all listeners from a non-existent path '${fullPath}'`);
            return;
        }
        dataNode = dataNode[property];
    }
    dataNode[ND].listeners.shallow = [];
    dataNode[ND].listeners.deep = [];
};
const getOriginalTarget = function getOriginalTarget() {
    return this.proxyNode[ND].target;
};
const getProxserveName = function getProxserveName() {
    return this.dataNode[NID].name;
};
const whoami = function whoami() {
    return this.dataNode[NID].name + this.dataNode[ND].path;
};
const getProxserveNodes = function getProxserveNodes() {
    return { dataNode: this.dataNode, proxyNode: this.proxyNode };
};

var pseudoMethods = /*#__PURE__*/Object.freeze({
    __proto__: null,
    activate: activate,
    block: block,
    getOriginalTarget: getOriginalTarget,
    getProxserveName: getProxserveName,
    getProxserveNodes: getProxserveNodes,
    on: on,
    once: once,
    removeAllListeners: removeAllListeners,
    removeListener: removeListener,
    stop: stop,
    whoami: whoami
});

/**
 * 2024 Native Signals <noamlin@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
/**
 * Convert property name to valid path segment
 */
function property2path(obj, property) {
    if (typeof property === "symbol") {
        throw new Error(`property of type "symbol" isn't path'able`);
    }
    const typeofobj = realtypeof(obj);
    switch (typeofobj) {
        case "Object": {
            return `.${property}`;
        }
        case "Array": {
            return `[${property}]`;
        }
        default: {
            console.warn(`Not Implemented (type of '${typeofobj}')`);
            return property;
        }
    }
}
/**
 * create or reset a node in a tree of meta-data (mainly path related)
 * and optionally create a node in a tree of proxy data (mainly objects related)
 */
function createNodes(parentDataNode, property, parentProxyNode, target) {
    //handle property path
    let propertyPath;
    {
        propertyPath = property2path({}, property); // if parent doesn't have target then treat it as object
    }
    //handle data node
    let dataNode = parentDataNode[property]; // try to receive existing data-node
    if (!dataNode) {
        dataNode = {
            [NID]: Object.create(parentDataNode[NID]),
            [ND]: {
                parentNode: parentDataNode,
                listeners: {
                    shallow: [],
                    deep: [],
                },
            },
        };
        parentDataNode[property] = dataNode;
    }
    delete dataNode[NID].status; // clears old status in case a node previously existed
    // updates path (for rare case where parent was array and then changed to object or vice versa)
    if (!parentDataNode[ND].isTreePrototype) {
        Object.assign(dataNode[ND], {
            path: parentDataNode[ND].path + propertyPath,
            propertyPath,
        });
    }
    else {
        Object.assign(dataNode[ND], {
            path: "",
            propertyPath: "",
        });
    }
    // handle proxy node
    let proxyNode;
    {
        // this scenario is dangerous and exists only for `on()` of future variables (paths) that don't yet exist
        proxyNode = undefined;
    }
    return { dataNode, proxyNode };
}

const PSEUDO_METHODS_ALTERNATIVE_NAMING_PREFIX = '$';

/**
 * 2024 Native Signals <noamlin@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
/**
 * save an array of all reserved function names
 * and also add synonyms to these functions
 */
const pseudoMethodsNames = Object.keys(pseudoMethods);
for (let i = pseudoMethodsNames.length - 1; i >= 0; i--) {
    const name = pseudoMethodsNames[i];
    const synonym = PSEUDO_METHODS_ALTERNATIVE_NAMING_PREFIX + name;
    pseudoMethodsNames.push(synonym);
}
//# sourceMappingURL=index.js.map

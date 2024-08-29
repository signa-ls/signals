/**
 * 2024 Native Signals <noamlin@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { proxyTypes, NODE_STATUSES, PROXY_STATUSES, ND, NID } from "./globals";
import type { TargetVariable } from "./types/globals";
import type {
	ProxserveInstance,
	ProxserveInstanceAlternatives,
	DataNode,
	ProxyNode,
	ProxserveInstanceMetadata,
} from "./types/proxserve-class";
import { unproxify, createNodes } from "./supporting-functions";
import * as pseudoMethods from "./pseudo-methods";
import * as proxyMethods from "./proxy-methods";
import { realtypeof, splitPath, evalPath } from "./general-functions";
import { initEmitEvent } from "./event-emitter";
import {
	DONT_PROXIFY_PREFIX,
	PSEUDO_METHODS_ALTERNATIVE_NAMING_PREFIX,
} from "./constants";

/**
 * save an array of all reserved function names
 * and also add synonyms to these functions
 */
const pseudoMethodsNames = Object.keys(pseudoMethods);
const pseudoMethodsExtended: Record<string | symbol, any> = {};
for (let i = pseudoMethodsNames.length - 1; i >= 0; i--) {
	const name = pseudoMethodsNames[i];
	const synonym = PSEUDO_METHODS_ALTERNATIVE_NAMING_PREFIX + name;

	pseudoMethodsNames.push(synonym);
	pseudoMethodsExtended[name] = pseudoMethods[name];
	pseudoMethodsExtended[synonym] = pseudoMethods[name];
}

interface MakeOptions {
	strict?: ProxserveInstanceMetadata["strict"];
	methodsEmitRaw?: ProxserveInstanceMetadata["methodsEmitRaw"];
	/** internal root name of the instance */
	name?: string;
	debug?: {
		destroyDelay?: ProxserveInstanceMetadata["destroyDelay"];
		trace?: ProxserveInstanceMetadata["trace"];
	};
}

/**
 * create a new proxy and a new node for a property of the parent's target-object
 */
function createProxy<T>(
	metadata: ProxserveInstanceMetadata,
	parentDataNode: DataNode,
	targetProperty?: string
): ProxserveInstance & T {
	const parentProxyNode = parentDataNode[ND].proxyNode!;
	let dataNode: DataNode;
	let proxyNode: ProxyNode;

	if (targetProperty === undefined) {
		//refering to own node and not a child property (meaning root object)
		dataNode = parentDataNode;
		proxyNode = parentProxyNode;
	} else {
		//create new or reset an existing data-node and then creates a new proxy-node
		const newNodes = createNodes(
			parentDataNode,
			targetProperty,
			parentProxyNode,
			parentProxyNode[ND].target[targetProperty]
		);
		dataNode = newNodes.dataNode;
		proxyNode = newNodes.proxyNode!;
	}

	const target = proxyNode[ND].target;

	const typeoftarget = realtypeof(target);

	if (proxyTypes[typeoftarget]) {
		const revocable = Proxy.revocable<TargetVariable>(target, {
			get: (
				target: TargetVariable /*same as parent scope 'target'*/,
				property: string | symbol,
				proxy
			) => {
				if (
					metadata.methodsEmitRaw === false &&
					Object.prototype.hasOwnProperty.call(
						proxyMethods,
						property
					) &&
					property in Object.getPrototypeOf(target)
				) {
					// use a proxy method instead of the built-in method that is on the prototype chain
					return proxyMethods[property].bind({
						metadata,
						dataNode,
						proxyNode,
					});
				}

				if (
					pseudoMethodsNames.includes(property as string) &&
					typeof target[property] === "undefined"
				) {
					// can access a pseudo function (or its synonym) if their keywords isn't used
					return pseudoMethodsExtended[property].bind({
						metadata,
						dataNode,
						proxyNode,
					});
				}

				if (
					!target.propertyIsEnumerable(property) ||
					typeof property === "symbol"
				) {
					return target[property]; // non-enumerable or non-path'able aren't proxied
				}

				if (
					// biome-ignore lint/complexity/useOptionalChain: <explanation>
					proxyNode[property] && // there's a child node
					proxyNode[property][ND].proxy && // it holds a proxy
					proxyNode[property][NID].status === PROXY_STATUSES.alive
				) {
					return proxyNode[property][ND].proxy;
				}

				return target[property];
			},

			set: (
				target /*same as parent scope 'target'*/,
				property,
				value,
				proxy
			) => {
				//'receiver' is proxy
				/**
				 * property can be a regular object because of a few possible reasons:
				 * 1. proxy is deleted from tree but user keeps accessing it then it means he saved a reference.
				 * 2. it is a non-enumerable property which means it was intentionally hidden.
				 * 3. property is a symbol and symbols can't be proxied because we can't create a normal path for them.
				 *    these properties are not proxied and should not emit change-event.
				 *    except for: length
				 * 4. property is manually set as raw object with the special prefix.
				 * TODO: make a list of all possible properties exceptions (maybe function 'name'?)
				 */
				if (dataNode[NID].status === NODE_STATUSES.blocked) {
					//blocked from changing values
					console.error(
						"object is blocked. can't change value of property:",
						property
					);
					return true;
				}

				if (
					typeof property === "symbol" ||
					property.startsWith(DONT_PROXIFY_PREFIX)
				) {
					target[property] = value;
					return true;
				}

				if (
					property !== "length" &&
					!target.propertyIsEnumerable(property)
				) {
					//if setting a whole new property then it is non-enumerable (yet) so a further test is needed
					const descriptor = Object.getOwnPropertyDescriptor(
						target,
						property
					);
					if (
						typeof descriptor === "object" &&
						descriptor.enumerable === false
					) {
						//property was previously set
						target[property] = value;
						return true;
					}
				}

				const oldValue = target[property]; // should not be proxy
				let isOldValueProxy = false;
				if (
					proxyNode[property] !== undefined &&
					proxyNode[property][ND].proxy !== undefined
				) {
					// about to overwrite an existing property which is a proxy (about to detach a proxy)
					proxyNode[property][NID].status = PROXY_STATUSES.deleted;
					delete dataNode[property][ND].proxyNode; // detach reference from data-node to proxy-node
					isOldValueProxy = true;
					if (metadata.strict) {
						// postpone this cpu intense function for later, probably when proxserve is not in use
						setTimeout(
							destroy,
							metadata.destroyDelay,
							proxyNode[property][ND].proxy
						);
					}
				}

				const rawValue = unproxify(value);
				target[property] = rawValue; //assign new value

				let isValueProxy = false;
				const typeofvalue = realtypeof(rawValue);
				if (proxyTypes[typeofvalue]) {
					createProxy(metadata, dataNode, property); // if trying to add a new value which is an object then make it a proxy
					isValueProxy = true;
				}

				initEmitEvent(
					dataNode,
					property,
					oldValue,
					isOldValueProxy,
					rawValue,
					isValueProxy,
					metadata.trace
				);

				return true;
			},

			/**
			 * TODO: this function is incomplete and doesn't handle all of 'descriptor' scenarios
			 */
			defineProperty: (
				target /*same as parent scope 'target'*/,
				property,
				descriptor
			) => {
				if (typeof property === "symbol") {
					Object.defineProperty(target, property, descriptor);
					return true;
				}

				const oldValue = target[property]; //should not be proxy
				let isOldValueProxy = false;
				if (
					proxyNode[property] !== undefined &&
					proxyNode[property][ND].proxy !== undefined
				) {
					//about to overwrite an existing property which is a proxy (about to detach a proxy)
					proxyNode[property][NID].status = PROXY_STATUSES.deleted;
					delete dataNode[property][ND].proxyNode; //detach reference from data-node to proxy-node
					isOldValueProxy = true;
					if (metadata.strict) {
						//postpone this cpu intense function for later, probably when proxserve is not is use
						setTimeout(
							destroy,
							metadata.destroyDelay,
							proxyNode[property][ND].proxy
						);
					}
				}

				descriptor.value = unproxify(descriptor.value);
				Object.defineProperty(target, property, descriptor); //defining the new value
				const value = descriptor.value;
				let isValueProxy = false;
				//excluding non-enumerable properties from being proxied
				const typeofvalue = realtypeof(descriptor.value);
				if (proxyTypes[typeofvalue] && descriptor.enumerable === true) {
					createProxy(metadata, dataNode, property); //if trying to add a new value which is an object then make it a proxy
					isValueProxy = true;
				}

				initEmitEvent(
					dataNode,
					property,
					oldValue,
					isOldValueProxy,
					value,
					isValueProxy,
					metadata.trace
				);

				return true;
			},

			deleteProperty: (
				target /*same as parent scope 'target'*/,
				property
			) => {
				if (
					!target.propertyIsEnumerable(property) ||
					typeof property === "symbol"
				) {
					//non-proxied properties simply get deleted and nothing more
					delete target[property];
					return true;
				}

				if (dataNode[NID].status === NODE_STATUSES.blocked) {
					//blocked from changing values
					console.error(
						`can't delete property '${property}'. object is blocked.`
					);
					return true;
				}

				if (property in target) {
					const oldValue = target[property]; //should not be proxy
					let isOldValueProxy = false;
					if (
						proxyNode[property] !== undefined &&
						proxyNode[property][ND].proxy !== undefined
					) {
						//about to overwrite an existing property which is a proxy (about to detach a proxy)
						proxyNode[property][NID].status =
							PROXY_STATUSES.deleted;
						delete dataNode[property][ND].proxyNode; //detach reference from data-node to proxy-node
						isOldValueProxy = true;
						if (metadata.strict) {
							//postpone this cpu intense function for later, probably when proxserve is not is use
							setTimeout(
								destroy,
								metadata.destroyDelay,
								proxyNode[property][ND].proxy
							);
						}
					}

					delete target[property]; // actual delete

					initEmitEvent(
						dataNode,
						property,
						oldValue,
						isOldValueProxy,
						undefined,
						false,
						metadata.trace
					);

					return true;
				}

				return true; //do nothing because there's nothing to delete
			},
		} as ProxyHandler<TargetVariable>) as {
			proxy: ProxserveInstance & T;
			revoke: () => void;
		};

		proxyNode[ND].proxy = revocable.proxy;
		proxyNode[ND].revoke = revocable.revoke;

		if (proxyTypes[typeoftarget]) {
			const keys = Object.keys(target); //handles both Objects and Arrays
			for (const key of keys) {
				if (key.startsWith(DONT_PROXIFY_PREFIX)) {
					continue;
				}
				const typeofproperty = realtypeof(target[key]);
				if (proxyTypes[typeofproperty]) {
					createProxy(metadata, dataNode, key); //recursively make child objects also proxies
				}
			}
		} else {
			console.warn(`Type of "${typeoftarget}" is not implemented`);
		}

		return revocable.proxy;
	}

	const types = Object.keys(proxyTypes);
	throw new Error(`Must observe an ${types.join("/")}`);
}

/**
 * make a new proxserve instance
 */
function make<T>(
	target: TargetVariable,
	options = {} as MakeOptions
): ProxserveInstance & T {
	const { strict = true, methodsEmitRaw = false, name = "", debug } = options;

	const destroyDelay = debug?.destroyDelay ?? 1000;
	const trace = debug?.trace ?? "none";

	const dataTreePrototype: DataNode = {
		[NID]: {
			status: NODE_STATUSES.active,
			name,
		},
		[ND]: { isTreePrototype: true } as DataNode[typeof ND],
	};
	const proxyTreePrototype: ProxyNode = {
		[NID]: { status: PROXY_STATUSES.alive },
		[ND]: { isTreePrototype: true } as ProxyNode[typeof ND],
	};

	const newNodes = createNodes(
		dataTreePrototype,
		"",
		proxyTreePrototype,
		target
	);

	const metadata = {
		strict,
		methodsEmitRaw,
		destroyDelay,
		trace,
		dataTree: newNodes.dataNode,
		proxyTree: newNodes.proxyNode,
	} as ProxserveInstanceMetadata;

	return createProxy<T>(metadata, metadata.dataTree);
}

/**
 * Recursively revoke proxies, allowing them to be garbage collected.
 * note: when this function is auto-called it should be called with a 1000 milliseconds
 * delay to let time for all events to finish.
 */
function destroy(proxy: ProxserveInstance) {
	let proxyNode: ProxyNode;
	try {
		const nodes = (
			proxy as ProxserveInstanceAlternatives
		).$getProxserveNodes();
		proxyNode = nodes.proxyNode;
	} catch (error) {
		return; // proxy variable isn't a proxy
	}

	if (proxyNode[NID].status === PROXY_STATUSES.alive) {
		proxyNode[NID].status = PROXY_STATUSES.deleted;
	}

	const typeofproxy = realtypeof(proxy);

	if (proxyTypes[typeofproxy]) {
		const keys = Object.keys(proxy); // handles both Objects and Arrays
		for (const key of keys) {
			if (key.startsWith(DONT_PROXIFY_PREFIX)) {
				continue;
			}
			try {
				const typeofproperty = realtypeof(proxy[key]);
				if (proxyTypes[typeofproperty]) {
					// going to proxy[key], which is deleted, will return the original target so we will bypass it
					destroy(proxyNode[key][ND].proxy!);
				}
			} catch (error) {
				console.error(error); // don't throw and kill the whole process just if this iteration fails
			}
		}

		proxyNode[ND].revoke?.();
		//proxyNode[ND].proxy = undefined;
		proxyNode[NID].status = PROXY_STATUSES.revoked;
	} else {
		console.warn(`Type of "${typeofproxy}" is not implemented`);
	}
}

// for importing this type from the main generated d.ts
export type { ProxserveInstance };

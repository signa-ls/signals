"use strict"

var Proxserve = (function() {
/**
 * return a string representing the full type of the variable
 * @param {*} variable 
 * @returns {String} - Object, Array, Number, String, Boolean, Null, Undefined, BigInt, Symbol, Date ...
 */
function realtypeof(variable) {
	let rawType = Object.prototype.toString.call(variable); //[object Object], [object Array], [object Number] ...
	return rawType.substring(8, rawType.length-1);
}

/**
 * check if variable is a number or a string of a number
 * @param {*} variable 
 */
function isNumeric(variable) {
	if(typeof variable === 'string' && variable === '') return false;
	else return !isNaN(variable);
}

let acceptableTypes = ['Object', 'Array', 'Map']; //acceptable types to be proxied
let acceptableEvents = ['change', 'create', 'update', 'delete'];
let objectsData = new WeakMap();
let proxiesData = new WeakMap();

/**
 * deep extraction of proxy's target and all sub proxies targets.
 * recursively get complete objects behind proxy
 * @param {*} proxy 
 */
function getOriginalTarget(proxy) {
	if(proxiesData.has(proxy)) {
		let target = proxiesData.get(proxy).target;
		let typeoftarget = realtypeof(target);

		if(typeoftarget === 'Object') {
			let returnObj = {};
			let keys = Object.keys(target);
			for(let key of keys) {
				returnObj[key] = getOriginalTarget(target[key]);
			}
			return returnObj;
		}
		else if(typeoftarget === 'Array') {
			let returnArr = [];
			for(let i = 0; i < target.length; i++) {
				returnArr[i] = getOriginalTarget(target[i]);
			}
			return returnArr;
		}
		else if(typeoftarget === 'Map') {
			console.warn('Not Implemented');
			return null;
		}
	}
	else {
		return proxy; //not in proxies list so is probably a primitive
	}
}

/**
 * add event listener on a proxy
 * @param {String} event 
 * @param {Function} listener 
 */
function $on(event, listener) {
	if(acceptableEvents.includes(event)) {
		objectsData.get(this).listeners.push([event, listener]);
	}
	else {
		throw new Error(`${event} is not a valid event. valid events are ${acceptableEvents.join(',')}`);
	}
}

/**
 * 
 * @param {Object|Array} target 
 * @param {String} path 
 * @param {*} oldValue 
 * @param {*} newValue 
 * @param {String} [changeType]
 */
function $emit(target, path, oldValue, newValue, changeType) {
	if(typeof changeType === 'undefined') {
		if(oldValue === newValue) {
			return; //no new change was made
		}

		if(newValue === undefined) {
			changeType = 'delete';
		}
		else if(oldValue === undefined) {
			changeType = 'create';
		}
		else {
			changeType = 'update';
		}
	}

	let data = objectsData.get(target);
	let change = {
		'path': path,
		'oldValue': oldValue,
		'value': newValue,
		'type': changeType
	};

	for(let item of data.listeners) { //item = [event, listener]
		if(item[0] === 'change' || item[0] === changeType) {
			item[1].call(target, change);
		}
	}

	if(data.parent !== null) { //we haven't reach root object
		$emit(data.parent, `${data.property}${path}`, oldValue, newValue, changeType);
	}
}

/**
 * Convert property name to valid path segment
 * @param {*} obj 
 * @param {String} property 
 */
function property2path(obj, property) {
	let typeofobj = realtypeof(obj);
	switch(typeofobj) {
		case 'Object': return `.${property}`;
		case 'Array': return `[${property}]`;
		default: console.warn('Not Implemented'); return property;
	}
}

return class Proxserve {
	constructor(target) {
		let parent = null, path = '', currentProperty = '';
		if(arguments.length > 1) {
			parent = arguments[1]; //the parent target
			path = arguments[2]; //the path up to this target
			currentProperty = property2path(parent, arguments[3]);
		}

		let typeoftarget = realtypeof(target);

		if(acceptableTypes.includes(typeoftarget)) {
			let revocable = Proxy.revocable(target, {
				get: function(target, property, receiver) {
					//can access 'on' function (or its synonym '$on') if their keywords weren't used
					if((property === 'on' || property === '$on') && typeof target[property] === 'undefined') {
						return $on.bind(target);
					}
					else {
						return target[property];
					}
				},
			
				set: function(target, property, value, receiver) {
					let typeofvalue = realtypeof(value);
					if(acceptableTypes.includes(typeofvalue)) {
						value = new Proxserve(value, target, `${path}${currentProperty}`, property); //if trying to add a new value which is an object then make it a proxy
					}
					let oldValue = getOriginalTarget(target[property]);
					target[property] = value; //assign new value

					$emit(target, property2path(target, property), oldValue, value);
					return true;
				},

				deleteProperty: function(target, property) {
					if(property in target) {
						let oldValue = getOriginalTarget(target[property]);
						Proxserve.destroy(target[property]);
						delete target[property]; //actual delete

						$emit(target, property2path(target, property), oldValue, undefined, 'delete');
						return true;
					}
					else {
						return false;
					}
				}
			});

			let details = {
				'parent': parent,
				'path': path,
				'property': currentProperty,
				'proxy': revocable.proxy,
				'revoke': revocable.revoke,
				'listeners': []
			};
			objectsData.set(target, details); //save important details regarding the original (raw) object
			proxiesData.set(revocable.proxy, {
				'target': target
			});

			if(typeoftarget === 'Object') {
				let keys = Object.keys(target);
				for(let key of keys) {
					let typeofproperty = realtypeof(target[key]);
					if(acceptableTypes.includes(typeofproperty)) {
						target[key] = new Proxserve(target[key], target, `${path}${currentProperty}`, key); //recursively make child objects also proxies
					}
				}
			}
			else if(typeoftarget === 'Array') {
				for(let i = 0; i < target.length; i++) {
					let typeofproperty = realtypeof(target[i]);
					if(acceptableTypes.includes(typeofproperty)) {
						target[i] = new Proxserve(target[i], target, `${path}${currentProperty}`, i); //recursively make child objects also proxies
					}
				}
			}
			else {
				console.warn('Not Implemented');
			}

			return revocable.proxy;
		}
		else {
			throw new Error('Must observe an '+acceptableTypes.join('/'));
		}
	}

	/**
	 * Recursively revoke proxies
	 * @param {*} proxy 
	 */
	static destroy(proxy) {
		let typeofproxy = realtypeof(proxy);
		if(acceptableTypes.includes(typeofproxy)) {
			let target = proxiesData.get(proxy).target;
			if(typeofproxy === 'Object') {
				let keys = Object.keys(target);
				for(let key of keys) {
					let typeofproperty = realtypeof(target[key]);
					if(acceptableTypes.includes(typeofproperty)) {
						Proxserve.destroy(target[key]);
					}
				}
			}
			else if(typeofproxy === 'Array') {
				for(let i = target.length - 1; i >= 0; i--) {
					let typeofproperty = realtypeof(target[i]);
					if(acceptableTypes.includes(typeofproperty)) {
						Proxserve.destroy(target[i]);
					}
				}
			}
			else {
				console.warn('Not Implemented');
			}

			if(objectsData.has(target)) {
				objectsData.get(target).revoke();
			}
		}
	}
}
})();

try { module.exports = exports = Proxserve; } catch (err) {};
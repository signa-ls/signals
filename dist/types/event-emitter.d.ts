/**
 * 2024 Native Signals <noamlin@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ChangeEvent, EVENT_NAMES } from "./types/globals";
import type { DataNode, ProxserveInstanceMetadata } from "./types/proxserve-class";
/**
 * process event and then bubble up and capture down the data tree
 */
export declare function initEmitEvent(dataNode: DataNode, property: string, oldValue: any, wasOldValueProxy: boolean, value: any, isValueProxy: boolean, trace?: ProxserveInstanceMetadata["trace"]): void;
/**
 * process special event for a built-in method and then bubble up the data tree
 * @param dataNode
 * @param funcName - the method's name
 * @param funcArgs - the method's arguments
 * @param oldValue
 * @param value
 */
export declare function initFunctionEmitEvent(dataNode: DataNode, funcName: EVENT_NAMES, funcArgs: ChangeEvent["args"], oldValue: any, value: any, trace?: ProxserveInstanceMetadata["trace"]): void;

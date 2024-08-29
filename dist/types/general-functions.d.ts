/**
 * 2024 Native Signals <noamlin@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import type { SomeObject, VariableTypes } from "./types/globals";
/**
 * return a string representing the full type of the variable
 */
export declare function realtypeof(variable: any): VariableTypes;
export declare function simpleClone(variable: any): any;
/**
 * splits a path to an array of properties
 * (benchmarked and is faster than regex and split())
 * @param path
 */
export declare function splitPath(path: string): Array<string | number>;
/**
 * evaluate a long path and return the designated object and its referred property
 */
export declare function evalPath(obj: SomeObject, path: string): {
    object: SomeObject;
    property: string | number;
    value: any;
};

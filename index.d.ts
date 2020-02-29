// Type definitions for ChangesReader
// Project: ChangesReader
// Definitions by: Glynn Bird <glynn.bird@gmail.com
/// <reference types="node" />

import { EventEmitter } from "events";

// Note that ES6 modules cannot directly export class objects.
// This file should be imported using the CommonJS-style:
//   import x = require('[~THE MODULE~]');
//
// Alternatively, if --allowSyntheticDefaultImports or
// --esModuleInterop is turned on, this file can also be
// imported as a default import:
//   import x from '[~THE MODULE~]';
//
// Refer to the TypeScript documentation at
// https://www.typescriptlang.org/docs/handbook/modules.html#export--and-import--require
// to understand common workarounds for this limitation of ES6 modules.


/*~ This declaration specifies that the class constructor function
 *~ is the exported object from the file
 */
export = ChangesReader;

/*~ Write your module's methods and properties in this class */
declare class ChangesReader {
    constructor(dbName: string, couchURL: string, headers?: object);
    start(opts: ChangesReader.Options): EventEmitter;
    get(opts: ChangesReader.Options): EventEmitter;
    spool(opts: ChangesReader.Options): EventEmitter;
    stop(): void;
}

/*~ If you want to expose types from your module as well, you can
 *~ place them in this block.
 *~
 *~ Note that if you decide to include this namespace, the module can be
 *~ incorrectly imported as a namespace object, unless
 *~ --esModuleInterop is turned on:
 *~   import * as x from '[~THE MODULE~]'; // WRONG! DO NOT DO THIS!
 */
declare namespace ChangesReader {
    export interface Options {
      batchSize?: number;
      fastChanges?: boolean;
      since?: string;
      includeDocs?: boolean;
      timeout?: number;
      wait?: boolean;
      qs?: object;
      selector?: MangoSelector;
    }
}

type MangoValue = number | string | Date | boolean | object | null;
type MangoOperator = '$lt' | '$lte' | '$eq' | '$ne' | '$gte' | '$gt' |
                  '$exists' | '$type' | 
                  '$in' | '$nin' | '$size' | '$mod' | '$regex' |
                  '$or' | '$and' | '$nor' | '$not' | '$all' | '$allMatch' | '$elemMatch';
type MangoSelector = {
  [K in MangoOperator]: MangoSelector | MangoValue | MangoValue[];
}
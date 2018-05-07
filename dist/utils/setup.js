"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/** On require, runs the test utils setup method */
const testing_1 = require("./testing");
const log_1 = require("../lib/log");
log_1.silence();
testing_1.setup().catch((e) => console.error(e));
//# sourceMappingURL=setup.js.map
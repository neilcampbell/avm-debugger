"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const encoding = __importStar(require("../../../encoding/encoding"));
const jsonrequest_1 = __importDefault(require("../jsonrequest"));
const compile_1 = require("./compile");
const types_1 = require("./models/types");
class Dryrun extends jsonrequest_1.default {
    constructor(c, dr) {
        super(c);
        this.blob = encoding.encode(dr.get_obj_for_encoding(true));
    }
    // eslint-disable-next-line class-methods-use-this
    path() {
        return '/v2/teal/dryrun';
    }
    /**
     * Executes dryrun
     * @param headers - A headers object
     */
    async do(headers = {}) {
        const txHeaders = (0, compile_1.setHeaders)(headers);
        const res = await this.c.post(this.path(), this.blob, null, txHeaders);
        return this.prepare(res.body);
    }
    // eslint-disable-next-line class-methods-use-this
    prepare(body) {
        return types_1.DryrunResponse.from_obj_for_encoding(body);
    }
}
exports.default = Dryrun;
//# sourceMappingURL=dryrun.js.map
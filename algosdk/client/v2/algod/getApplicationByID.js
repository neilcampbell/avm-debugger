"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonrequest_1 = __importDefault(require("../jsonrequest"));
const types_1 = require("./models/types");
class GetApplicationByID extends jsonrequest_1.default {
    constructor(c, intDecoding, index) {
        super(c, intDecoding);
        this.index = index;
        this.index = index;
    }
    path() {
        return `/v2/applications/${this.index}`;
    }
    // eslint-disable-next-line class-methods-use-this
    prepare(body) {
        return types_1.Application.from_obj_for_encoding(body);
    }
}
exports.default = GetApplicationByID;
//# sourceMappingURL=getApplicationByID.js.map
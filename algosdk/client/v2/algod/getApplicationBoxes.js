"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonrequest_1 = __importDefault(require("../jsonrequest"));
const types_1 = require("./models/types");
/**
 * Given an application ID, return all the box names associated with the app.
 *
 * #### Example
 * ```typescript
 * const index = 60553466;
 * const boxesResponse = await algodClient.getApplicationBoxes(index).max(3).do();
 * const boxNames = boxesResponse.boxes.map(box => box.name);
 * ```
 *
 * [Response data schema details](https://developer.algorand.org/docs/rest-apis/algod/#get-v2applicationsapplication-idboxes)
 * @param index - The application ID to look up.
 * @category GET
 */
class GetApplicationBoxes extends jsonrequest_1.default {
    constructor(c, intDecoding, index) {
        super(c, intDecoding);
        this.index = index;
        this.index = index;
        this.query.max = 0;
    }
    /**
     * @returns `/v2/applications/${index}/boxes`
     */
    path() {
        return `/v2/applications/${this.index}/boxes`;
    }
    /**
     * Limit results for pagination.
     *
     * #### Example
     * ```typescript
     * const maxResults = 20;
     * const boxesResult = await algodClient
     *        .GetApplicationBoxes(1234)
     *        .limit(maxResults)
     *        .do();
     * ```
     *
     * @param limit - maximum number of results to return.
     * @category query
     */
    max(max) {
        this.query.max = max;
        return this;
    }
    // eslint-disable-next-line class-methods-use-this
    prepare(body) {
        return types_1.BoxesResponse.from_obj_for_encoding(body);
    }
}
exports.default = GetApplicationBoxes;
//# sourceMappingURL=getApplicationBoxes.js.map
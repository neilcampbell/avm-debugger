"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonrequest_1 = __importDefault(require("../jsonrequest"));
class LookupAccountByID extends jsonrequest_1.default {
    /**
     * Returns information about the given account.
     *
     * #### Example
     * ```typescript
     * const address = "XBYLS2E6YI6XXL5BWCAMOA4GTWHXWENZMX5UHXMRNWWUQ7BXCY5WC5TEPA";
     * const accountInfo = await indexerClient.lookupAccountByID(address).do();
     * ```
     *
     * [Response data schema details](https://developer.algorand.org/docs/rest-apis/indexer/#get-v2accountsaccount-id)
     * @param account - The address of the account to look up.
     * @category GET
     */
    constructor(c, intDecoding, account) {
        super(c, intDecoding);
        this.account = account;
        this.account = account;
    }
    /**
     * @returns `/v2/accounts/${account}`
     */
    path() {
        return `/v2/accounts/${this.account}`;
    }
    /**
     * Specify round to filter with.
     *
     * #### Example
     * ```typescript
     * const address = "XBYLS2E6YI6XXL5BWCAMOA4GTWHXWENZMX5UHXMRNWWUQ7BXCY5WC5TEPA";
     * const targetBlock = 18309917;
     * const accountInfo = await indexerClient
     *        .lookupAccountByID(address)
     *        .round(targetBlock)
     *        .do();
     * ```
     * @param round
     */
    round(round) {
        this.query.round = round;
        return this;
    }
    /**
     * Include all items including closed accounts, deleted applications, destroyed assets, opted-out asset holdings, and closed-out application localstates.
     *
     * #### Example 1
     * ```typescript
     * const address = "XBYLS2E6YI6XXL5BWCAMOA4GTWHXWENZMX5UHXMRNWWUQ7BXCY5WC5TEPA";
     * const accountInfo = await indexerClient
     *        .lookupAccountByID(address)
     *        .includeAll(false)
     *        .do();
     * ```
     *
     * #### Example 2
     * ```typescript
     * const address = "XBYLS2E6YI6XXL5BWCAMOA4GTWHXWENZMX5UHXMRNWWUQ7BXCY5WC5TEPA";
     * const accountInfo = await indexerClient
     *        .lookupAccountByID(address)
     *        .includeAll()
     *        .do();
     * ```
     * @param value
     */
    includeAll(value = true) {
        this.query['include-all'] = value;
        return this;
    }
    /**
     * Exclude additional items such as asset holdings, application local data stored for this account, asset parameters created by this account, and application parameters created by this account.
     *
     * #### Example 1
     * ```typescript
     * const address = "XBYLS2E6YI6XXL5BWCAMOA4GTWHXWENZMX5UHXMRNWWUQ7BXCY5WC5TEPA";
     * const accountInfo = await indexerClient
     *        .lookupAccountByID(address)
     *        .exclude("all")
     *        .do();
     * ```
     *
     * #### Example 2
     * ```typescript
     * const address = "XBYLS2E6YI6XXL5BWCAMOA4GTWHXWENZMX5UHXMRNWWUQ7BXCY5WC5TEPA";
     * const accountInfo = await indexerClient
     *        .lookupAccountByID(address)
     *        .exclude("assets,created-assets")
     *        .do();
     * ```
     * @remarks By default, it behaves as exclude=none
     * @param exclude - Array of `all`, `assets`, `created-assets`, `apps-local-state`, `created-apps`, `none`
     * @category query
     */
    exclude(exclude) {
        this.query.exclude = exclude;
        return this;
    }
}
exports.default = LookupAccountByID;
//# sourceMappingURL=lookupAccountByID.js.map
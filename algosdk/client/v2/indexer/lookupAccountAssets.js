"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonrequest_1 = __importDefault(require("../jsonrequest"));
class LookupAccountAssets extends jsonrequest_1.default {
    /**
     * Returns asset about the given account.
     *
     * #### Example
     * ```typescript
     * const address = "XBYLS2E6YI6XXL5BWCAMOA4GTWHXWENZMX5UHXMRNWWUQ7BXCY5WC5TEPA";
     * const accountAssets = await indexerClient.lookupAccountAssets(address).do();
     * ```
     *
     * [Response data schema details](https://developer.algorand.org/docs/rest-apis/indexer/#get-v2accountsaccount-idassets)
     * @param account - The address of the account to look up.
     * @category GET
     */
    constructor(c, intDecoding, account) {
        super(c, intDecoding);
        this.account = account;
        this.account = account;
    }
    /**
     * @returns `/v2/accounts/${account}/assets`
     */
    path() {
        return `/v2/accounts/${this.account}/assets`;
    }
    /**
     * Add a limit for filter.
     *
     * #### Example
     * ```typescript
     * const address = "XBYLS2E6YI6XXL5BWCAMOA4GTWHXWENZMX5UHXMRNWWUQ7BXCY5WC5TEPA";
     * const maxResults = 20;
     * const accountAssets = await indexerClient
     *        .lookupAccountAssets(address)
     *        .limit(maxResults)
     *        .do();
     * ```
     *
     * @param limit - maximum number of results to return.
     * @category query
     */
    limit(limit) {
        this.query.limit = limit;
        return this;
    }
    /**
     * Specify round to filter with.
     *
     * #### Example
     * ```typescript
     * const address = "XBYLS2E6YI6XXL5BWCAMOA4GTWHXWENZMX5UHXMRNWWUQ7BXCY5WC5TEPA";
     * const targetBlock = 18309917;
     * const accountAssets = await indexerClient
     *        .lookupAccountAssets(address)
     *        .round(targetBlock)
     *        .do();
     * ```
     * @param round
     * @category query
     */
    round(round) {
        this.query.round = round;
        return this;
    }
    /**
     * Specify the next page of results.
     *
     * #### Example
     * ```typescript
     * const address = "XBYLS2E6YI6XXL5BWCAMOA4GTWHXWENZMX5UHXMRNWWUQ7BXCY5WC5TEPA";
     * const maxResults = 20;
     *
     * const accountAssetsPage1 = await indexerClient
     *        .lookupAccountAssets(address)
     *        .limit(maxResults)
     *        .do();
     *
     * const accountAssetsPage2 = await indexerClient
     *        .lookupAccountAssets(address)
     *        .limit(maxResults)
     *        .next(accountAssetsPage1["next-token"])
     *        .do();
     * ```
     * @param nextToken - provided by the previous results.
     * @category query
     */
    nextToken(nextToken) {
        this.query.next = nextToken;
        return this;
    }
    /**
     * Include all items including closed accounts, deleted applications, destroyed assets, opted-out asset holdings, and closed-out application localstates
     *
     * #### Example
     * ```typescript
     * const address = "XBYLS2E6YI6XXL5BWCAMOA4GTWHXWENZMX5UHXMRNWWUQ7BXCY5WC5TEPA";
     * const accountAssets = await indexerClient
     *        .lookupAccountAssets(address)
     *        .includeAll(false)
     *        .do();
     * ```
     * @param value
     * @category query
     */
    includeAll(value = true) {
        this.query['include-all'] = value;
        return this;
    }
    /**
     * Specify an assetID to search for.
     *
     * #### Example
     * ```typescript
     * const assetId = 163650;
     * const address = "XBYLS2E6YI6XXL5BWCAMOA4GTWHXWENZMX5UHXMRNWWUQ7BXCY5WC5TEPA";
     * const assetAssets = await indexerClient
     *        .lookupAccountAssets(address)
     *        .assetId(assetId)
     *        .do();
     * ```
     * @param index - the assetID
     * @category query
     */
    assetId(index) {
        this.query['asset-id'] = index;
        return this;
    }
}
exports.default = LookupAccountAssets;
//# sourceMappingURL=lookupAccountAssets.js.map
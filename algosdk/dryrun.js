"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DryrunResult = exports.createDryrun = void 0;
const types_1 = require("./client/v2/algod/models/types");
const address_1 = require("./encoding/address");
const binarydata_1 = require("./encoding/binarydata");
const transactions_1 = require("./types/transactions");
const defaultAppId = 1380011588;
const defaultMaxWidth = 30;
/**
 * createDryrun takes an Algod Client (from algod.AlgodV2Client) and an array of Signed Transactions
 * from (transaction.SignedTransaction) and creates a DryrunRequest object with relevant balances
 * @param client - the AlgodClient to make requests against
 * @param txns - the array of SignedTransaction to use for generating the DryrunRequest object
 * @param protocolVersion - the string representing the protocol version to use
 * @param latestTimestamp - the timestamp
 * @param round - the round available to some TEAL scripts. Defaults to the current round on the network.
 * @param sources - TEAL source text that gets uploaded, compiled, and inserted into transactions or application state.
 * @returns the DryrunRequest object constructed from the SignedTransactions passed
 */
async function createDryrun({ client, txns, protocolVersion, latestTimestamp, round, sources, }) {
    const appInfos = [];
    const acctInfos = [];
    const apps = [];
    const assets = [];
    const accts = [];
    for (const t of txns) {
        if (t.txn.type === transactions_1.TransactionType.appl) {
            accts.push((0, address_1.encodeAddress)(t.txn.sender.publicKey));
            if (t.txn.appAccounts)
                accts.push(...t.txn.appAccounts.map((a) => (0, address_1.encodeAddress)(a.publicKey)));
            if (t.txn.appForeignApps) {
                apps.push(...t.txn.appForeignApps);
                accts.push(...t.txn.appForeignApps.map((aidx) => (0, address_1.getApplicationAddress)(aidx)));
            }
            if (t.txn.appForeignAssets)
                assets.push(...t.txn.appForeignAssets);
            // Create application,
            if (t.txn.appIndex === undefined || t.txn.appIndex === 0) {
                appInfos.push(new types_1.Application({
                    id: defaultAppId,
                    params: new types_1.ApplicationParams({
                        creator: (0, address_1.encodeAddress)(t.txn.sender.publicKey),
                        approvalProgram: t.txn.appApprovalProgram,
                        clearStateProgram: t.txn.appClearProgram,
                        localStateSchema: new types_1.ApplicationStateSchema({
                            numUint: t.txn.appLocalInts,
                            numByteSlice: t.txn.appLocalByteSlices,
                        }),
                        globalStateSchema: new types_1.ApplicationStateSchema({
                            numUint: t.txn.appGlobalInts,
                            numByteSlice: t.txn.appGlobalByteSlices,
                        }),
                    }),
                }));
            }
            else {
                apps.push(t.txn.appIndex);
                accts.push((0, address_1.getApplicationAddress)(t.txn.appIndex));
            }
        }
    }
    // Dedupe and add creator to accts array
    const assetPromises = [];
    for (const assetId of [...new Set(assets)]) {
        assetPromises.push(client
            .getAssetByID(assetId)
            .do()
            .then((assetInfo) => {
            accts.push(assetInfo.params.creator);
        }));
    }
    // Wait for assets to finish since we append to accts array
    await Promise.all(assetPromises);
    // Dedupe and get app info for all apps
    const appPromises = [];
    for (const appId of [...new Set(apps)]) {
        appPromises.push(client
            .getApplicationByID(appId)
            .do()
            .then((appInfo) => {
            appInfos.push(appInfo);
            accts.push(appInfo.params.creator);
        }));
    }
    await Promise.all(appPromises);
    const acctPromises = [];
    for (const acct of [...new Set(accts)]) {
        acctPromises.push(client
            .accountInformation(acct)
            .do()
            .then((acctInfo) => {
            acctInfos.push(acctInfo);
        }));
    }
    await Promise.all(acctPromises);
    return new types_1.DryrunRequest({
        txns: txns.map((st) => ({ ...st, txn: st.txn.get_obj_for_encoding() })),
        accounts: acctInfos,
        apps: appInfos,
        latestTimestamp,
        round,
        protocolVersion,
        sources,
    });
}
exports.createDryrun = createDryrun;
class DryrunStackValue {
    constructor(sv) {
        this.type = 0;
        this.bytes = '';
        this.uint = 0;
        this.type = sv.type;
        this.bytes = sv.bytes;
        this.uint = sv.uint;
    }
    toString() {
        if (this.type === 1) {
            return `0x${(0, binarydata_1.bytesToHex)((0, binarydata_1.base64ToBytes)(this.bytes))}`;
        }
        return this.uint.toString();
    }
}
class DryrunTraceLine {
    constructor(line) {
        this.error = '';
        this.line = 0;
        this.pc = 0;
        this.scratch = [];
        this.stack = [];
        this.error = line.error === undefined ? '' : line.error;
        this.line = line.line;
        this.pc = line.pc;
        this.scratch = line.scratch;
        this.stack = line.stack.map((sv) => new DryrunStackValue(sv));
    }
}
class DryrunTrace {
    constructor(t) {
        this.trace = [];
        if (t == null)
            return;
        this.trace = t.map((line) => new DryrunTraceLine(line));
    }
}
function truncate(str, maxValueWidth) {
    if (str.length > maxValueWidth && maxValueWidth > 0) {
        return `${str.slice(0, maxValueWidth)}...`;
    }
    return str;
}
function scratchToString(prevScratch, currScratch) {
    if (currScratch.length === 0)
        return '';
    let newScratchIdx = null;
    for (let idx = 0; idx < currScratch.length; idx++) {
        if (idx > prevScratch.length) {
            newScratchIdx = idx;
            continue;
        }
        if (JSON.stringify(prevScratch[idx]) !== JSON.stringify(currScratch[idx])) {
            newScratchIdx = idx;
        }
    }
    if (newScratchIdx == null)
        return '';
    const newScratch = currScratch[newScratchIdx];
    if (newScratch.bytes.length > 0) {
        return `${newScratchIdx} = 0x${(0, binarydata_1.bytesToHex)((0, binarydata_1.base64ToBytes)(newScratch.bytes))}`;
    }
    return `${newScratchIdx} = ${newScratch.uint.toString()}`;
}
function stackToString(stack, reverse) {
    const svs = reverse ? stack.reverse() : stack;
    return `[${svs
        .map((sv) => {
        switch (sv.type) {
            case 1:
                return `0x${(0, binarydata_1.bytesToHex)((0, binarydata_1.base64ToBytes)(sv.bytes))}`;
            case 2:
                return `${sv.uint.toString()}`;
            default:
                return '';
        }
    })
        .join(', ')}]`;
}
class DryrunTransactionResult {
    constructor(dtr) {
        this.disassembly = [];
        this.appCallMessages = [];
        this.localDeltas = [];
        this.globalDelta = [];
        this.cost = 0;
        this.logicSigMessages = [];
        this.logicSigDisassembly = [];
        this.logs = [];
        this.appCallTrace = undefined;
        this.logicSigTrace = undefined;
        this.required = ['disassembly'];
        this.optionals = [
            'app-call-messages',
            'local-deltas',
            'global-delta',
            'cost',
            'logic-sig-messages',
            'logic-sig-disassembly',
            'logs',
        ];
        this.traces = ['app-call-trace', 'logic-sig-trace'];
        this.disassembly = dtr.disassembly;
        this.appCallMessages = dtr['app-call-messages'];
        this.localDeltas = dtr['local-deltas'];
        this.globalDelta = dtr['global-delta'];
        this.cost = dtr.cost;
        this.logicSigMessages = dtr['logic-sig-messages'];
        this.logicSigDisassembly = dtr['logic-sig-disassembly'];
        this.logs = dtr.logs;
        this.appCallTrace = new DryrunTrace(dtr['app-call-trace']);
        this.logicSigTrace = new DryrunTrace(dtr['logic-sig-trace']);
    }
    appCallRejected() {
        return (this.appCallMessages !== undefined &&
            this.appCallMessages.includes('REJECT'));
    }
    logicSigRejected() {
        return (this.logicSigMessages !== undefined &&
            this.logicSigMessages.includes('REJECT'));
    }
    static trace(drt, disassembly, spc) {
        const maxWidth = spc.maxValueWidth || defaultMaxWidth;
        // Create the array of arrays, each sub array contains N columns
        const lines = [['pc#', 'ln#', 'source', 'scratch', 'stack']];
        for (let idx = 0; idx < drt.trace.length; idx++) {
            const { line, error, pc, scratch, stack } = drt.trace[idx];
            const currScratch = scratch !== undefined ? scratch : [];
            const prevScratch = idx > 0 && drt.trace[idx - 1].scratch !== undefined
                ? drt.trace[idx - 1].scratch
                : [];
            const src = error === '' ? disassembly[line] : `!! ${error} !!`;
            lines.push([
                pc.toString().padEnd(3, ' '),
                line.toString().padEnd(3, ' '),
                truncate(src, maxWidth),
                truncate(scratchToString(prevScratch, currScratch), maxWidth),
                truncate(stackToString(stack, spc.topOfStackFirst), maxWidth),
            ]);
        }
        // Get the max length for each column
        const maxLengths = lines.reduce((prev, curr) => {
            const newVal = new Array(lines[0].length).fill(0);
            for (let idx = 0; idx < prev.length; idx++) {
                newVal[idx] =
                    curr[idx].length > prev[idx] ? curr[idx].length : prev[idx];
            }
            return newVal;
        }, new Array(lines[0].length).fill(0));
        return `${lines
            .map((line) => line
            .map((v, idx) => v.padEnd(maxLengths[idx] + 1, ' '))
            .join('|')
            .trim())
            .join('\n')}\n`;
    }
    appTrace(spc) {
        if (this.appCallTrace === undefined || !this.disassembly)
            return '';
        let conf = spc;
        if (spc === undefined)
            conf = {
                maxValueWidth: defaultMaxWidth,
                topOfStackFirst: false,
            };
        return DryrunTransactionResult.trace(this.appCallTrace, this.disassembly, conf);
    }
    lsigTrace(spc) {
        if (this.logicSigTrace === undefined ||
            this.logicSigDisassembly === undefined)
            return '';
        let conf = spc;
        if (spc === undefined)
            conf = {
                maxValueWidth: defaultMaxWidth,
                topOfStackFirst: true,
            };
        return DryrunTransactionResult.trace(this.logicSigTrace, this.logicSigDisassembly, conf);
    }
}
class DryrunResult {
    constructor(drrResp) {
        this.error = '';
        this.protocolVersion = '';
        this.txns = [];
        this.error = drrResp.error;
        this.protocolVersion = drrResp['protocol-version'];
        this.txns = drrResp.txns.map((txn) => new DryrunTransactionResult(txn));
    }
}
exports.DryrunResult = DryrunResult;
//# sourceMappingURL=dryrun.js.map
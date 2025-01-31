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
const binarydata_1 = require("../encoding/binarydata");
const txn = __importStar(require("../transaction"));
const serviceClient_1 = __importDefault(require("./v2/serviceClient"));
class Kmd extends serviceClient_1.default {
    constructor(token, baseServer = 'http://127.0.0.1', port = 7833, headers = {}) {
        super('X-KMD-API-Token', token, baseServer, port, headers);
    }
    /**
     * version returns a VersionResponse containing a list of kmd API versions supported by this running kmd instance.
     */
    async versions() {
        const res = await this.c.get('/versions');
        return res.body;
    }
    /**
     * listWallets returns a ListWalletsResponse containing the list of wallets known to kmd. Using a wallet ID
     * returned from this endpoint, you can initialize a wallet handle with client.InitWalletHandle
     */
    async listWallets() {
        const res = await this.c.get('/v1/wallets');
        return res.body;
    }
    /**
     * createWallet creates a wallet with the specified name, password, driver,
     * and master derivation key. If the master derivation key is blank, one is
     * generated internally to kmd. CreateWallet returns a CreateWalletResponse
     * containing information about the new wallet.
     * @param walletName
     * @param walletPassword
     * @param walletDriverName
     * @param walletMDK
     */
    async createWallet(walletName, walletPassword, walletMDK = new Uint8Array(), walletDriverName = 'sqlite') {
        const req = {
            wallet_name: walletName,
            wallet_driver_name: walletDriverName,
            wallet_password: walletPassword,
            master_derivation_key: (0, binarydata_1.bytesToBase64)(walletMDK),
        };
        const res = await this.c.post('/v1/wallet', req);
        return res.body;
    }
    /**
     * initWalletHandle accepts a wallet ID and a wallet password, and returns an
     * initWalletHandleResponse containing a wallet handle token. This wallet
     * handle token can be used for subsequent operations on this wallet, like key
     * generation, transaction signing, etc.. WalletHandleTokens expire after a
     * configurable number of seconds, and must be renewed periodically with
     * RenewWalletHandle. It is good practice to call ReleaseWalletHandle when
     * you're done interacting with this wallet.
     * @param walletID
     * @param walletPassword
     */
    async initWalletHandle(walletID, walletPassword) {
        const req = {
            wallet_id: walletID,
            wallet_password: walletPassword,
        };
        const res = await this.c.post('/v1/wallet/init', req);
        return res.body;
    }
    /**
     * releaseWalletHandle invalidates the passed wallet handle token, making
     * it unusuable for subsequent wallet operations.
     * @param walletHandle
     */
    async releaseWalletHandle(walletHandle) {
        const req = {
            wallet_handle_token: walletHandle,
        };
        const res = await this.c.post('/v1/wallet/release', req);
        return res.body;
    }
    /**
     * renewWalletHandle accepts a wallet handle and attempts to renew it, moving
     * the expiration time to some number of seconds in the future. It returns a
     * RenewWalletHandleResponse containing the walletHandle and the number of
     * seconds until expiration
     * @param walletHandle
     */
    async renewWalletHandle(walletHandle) {
        const req = {
            wallet_handle_token: walletHandle,
        };
        const res = await this.c.post('/v1/wallet/renew', req);
        return res.body;
    }
    /**
     * renameWallet accepts a wallet ID, wallet password, and a new wallet name,
     * and renames the underlying wallet.
     * @param walletID
     * @param walletPassword
     * @param newWalletName
     */
    async renameWallet(walletID, walletPassword, newWalletName) {
        const req = {
            wallet_id: walletID,
            wallet_password: walletPassword,
            wallet_name: newWalletName,
        };
        const res = await this.c.post('/v1/wallet/rename', req);
        return res.body;
    }
    /**
     * getWallet accepts a wallet handle and returns high level information about
     * this wallet in a GetWalletResponse.
     * @param walletHandle
     */
    async getWallet(walletHandle) {
        const req = {
            wallet_handle_token: walletHandle,
        };
        const res = await this.c.post('/v1/wallet/info', req);
        return res.body;
    }
    /**
     * exportMasterDerivationKey accepts a wallet handle and a wallet password, and
     * returns an ExportMasterDerivationKeyResponse containing the master
     * derivation key. This key can be used as an argument to CreateWallet in
     * order to recover the keys generated by this wallet. The master derivation
     * key can be encoded as a sequence of words using the mnemonic library, and
     * @param walletHandle
     * @param walletPassword
     */
    async exportMasterDerivationKey(walletHandle, walletPassword) {
        const req = {
            wallet_handle_token: walletHandle,
            wallet_password: walletPassword,
        };
        const res = await this.c.post('/v1/master-key/export', req);
        return {
            master_derivation_key: (0, binarydata_1.base64ToBytes)(res.body.master_derivation_key),
        };
    }
    /**
     * importKey accepts a wallet handle and an ed25519 private key, and imports
     * the key into the wallet. It returns an ImportKeyResponse containing the
     * address corresponding to this private key.
     * @param walletHandle
     * @param secretKey
     */
    async importKey(walletHandle, secretKey) {
        const req = {
            wallet_handle_token: walletHandle,
            private_key: (0, binarydata_1.bytesToBase64)(secretKey),
        };
        const res = await this.c.post('/v1/key/import', req);
        return res.body;
    }
    /**
     * exportKey accepts a wallet handle, wallet password, and address, and returns
     * an ExportKeyResponse containing the ed25519 private key corresponding to the
     * address stored in the wallet.
     * @param walletHandle
     * @param walletPassword
     * @param addr
     */
    async exportKey(walletHandle, walletPassword, addr) {
        const req = {
            wallet_handle_token: walletHandle,
            address: addr,
            wallet_password: walletPassword,
        };
        const res = await this.c.post('/v1/key/export', req);
        return { private_key: (0, binarydata_1.base64ToBytes)(res.body.private_key) };
    }
    /**
     * generateKey accepts a wallet handle, and then generates the next key in the
     * wallet using its internal master derivation key. Two wallets with the same
     * master derivation key will generate the same sequence of keys.
     * @param walletHandle
     */
    async generateKey(walletHandle) {
        const req = {
            wallet_handle_token: walletHandle,
            display_mnemonic: false,
        };
        const res = await this.c.post('/v1/key', req);
        return res.body;
    }
    /**
     * deleteKey accepts a wallet handle, wallet password, and address, and deletes
     * the information about this address from the wallet (including address and
     * secret key). If DeleteKey is called on a key generated using GenerateKey,
     * the same key will not be generated again. However, if a wallet is recovered
     * using the master derivation key, a key generated in this way can be
     * recovered.
     * @param walletHandle
     * @param walletPassword
     * @param addr
     */
    async deleteKey(walletHandle, walletPassword, addr) {
        const req = {
            wallet_handle_token: walletHandle,
            address: addr,
            wallet_password: walletPassword,
        };
        const res = await this.c.delete('/v1/key', req);
        return res.body;
    }
    /**
     * ListKeys accepts a wallet handle and returns a ListKeysResponse containing
     * all of the addresses for which this wallet contains secret keys.
     * @param walletHandle
     */
    async listKeys(walletHandle) {
        const req = {
            wallet_handle_token: walletHandle,
        };
        const res = await this.c.post('/v1/key/list', req);
        return res.body;
    }
    /**
     * signTransaction accepts a wallet handle, wallet password, and a transaction,
     * and returns and SignTransactionResponse containing an encoded, signed
     * transaction. The transaction is signed using the key corresponding to the
     * Sender field.
     * @param walletHandle
     * @param walletPassword
     * @param transaction
     */
    async signTransaction(walletHandle, walletPassword, transaction) {
        const tx = txn.instantiateTxnIfNeeded(transaction);
        const req = {
            wallet_handle_token: walletHandle,
            wallet_password: walletPassword,
            transaction: (0, binarydata_1.bytesToBase64)(tx.toByte()),
        };
        const res = await this.c.post('/v1/transaction/sign', req);
        if (res.status === 200) {
            return (0, binarydata_1.base64ToBytes)(res.body.signed_transaction);
        }
        return res.body;
    }
    /**
     * signTransactionWithSpecificPublicKey accepts a wallet handle, wallet password, a transaction, and a public key,
     * and returns and SignTransactionResponse containing an encoded, signed
     * transaction. The transaction is signed using the key corresponding to the
     * publicKey arg.
     * @param walletHandle
     * @param walletPassword
     * @param transaction
     * @param publicKey - sign the txn with the key corresponding to publicKey (used for working with a rekeyed addr)
     */
    async signTransactionWithSpecificPublicKey(walletHandle, walletPassword, transaction, publicKey) {
        const tx = txn.instantiateTxnIfNeeded(transaction);
        const pk = (0, binarydata_1.coerceToBytes)(publicKey);
        const req = {
            wallet_handle_token: walletHandle,
            wallet_password: walletPassword,
            transaction: (0, binarydata_1.bytesToBase64)(tx.toByte()),
            public_key: (0, binarydata_1.bytesToBase64)(pk),
        };
        const res = await this.c.post('/v1/transaction/sign', req);
        if (res.status === 200) {
            return (0, binarydata_1.base64ToBytes)(res.body.signed_transaction);
        }
        return res.body;
    }
    /**
     * listMultisig accepts a wallet handle and returns a ListMultisigResponse
     * containing the multisig addresses whose preimages are stored in this wallet.
     * A preimage is the information needed to reconstruct this multisig address,
     * including multisig version information, threshold information, and a list
     * of public keys.
     * @param walletHandle
     */
    async listMultisig(walletHandle) {
        const req = {
            wallet_handle_token: walletHandle,
        };
        const res = await this.c.post('/v1/multisig/list', req);
        return res.body;
    }
    /**
     * importMultisig accepts a wallet handle and the information required to
     * generate a multisig address. It derives this address, and stores all of the
     * information within the wallet. It returns a ImportMultisigResponse with the
     * derived address.
     * @param walletHandle
     * @param version
     * @param threshold
     * @param pks
     */
    async importMultisig(walletHandle, version, threshold, pks) {
        const req = {
            wallet_handle_token: walletHandle,
            multisig_version: version,
            threshold,
            pks,
        };
        const res = await this.c.post('/v1/multisig/import', req);
        return res.body;
    }
    /**
     * exportMultisig accepts a wallet handle, wallet password, and multisig
     * address, and returns an ExportMultisigResponse containing the stored
     * multisig preimage. The preimage contains all of the information necessary
     * to derive the multisig address, including version, threshold, and a list of
     * public keys.
     * @param walletHandle
     * @param walletPassword
     * @param addr
     */
    async exportMultisig(walletHandle, addr) {
        const req = {
            wallet_handle_token: walletHandle,
            address: addr,
        };
        const res = await this.c.post('/v1/multisig/export', req);
        return res.body;
    }
    /**
     * signMultisigTransaction accepts a wallet handle, wallet password,
     * transaction, public key (*not* an address), and an optional partial
     * MultisigSig. It looks up the secret key corresponding to the public key, and
     * returns a SignMultisigTransactionResponse containing a MultisigSig with a
     * signature by the secret key included.
     * @param walletHandle
     * @param pw
     * @param tx
     * @param pk
     * @param partial
     */
    async signMultisigTransaction(walletHandle, pw, transaction, pk, partial) {
        const tx = txn.instantiateTxnIfNeeded(transaction);
        const pubkey = (0, binarydata_1.coerceToBytes)(pk);
        const req = {
            wallet_handle_token: walletHandle,
            transaction: (0, binarydata_1.bytesToBase64)(tx.toByte()),
            public_key: (0, binarydata_1.bytesToBase64)(pubkey),
            partial_multisig: partial,
            wallet_password: pw,
        };
        const res = await this.c.post('/v1/multisig/sign', req);
        return res.body;
    }
    /**
     * deleteMultisig accepts a wallet handle, wallet password, and multisig
     * address, and deletes the information about this multisig address from the
     * wallet (including address and secret key).
     * @param walletHandle
     * @param walletPassword
     * @param addr
     */
    async deleteMultisig(walletHandle, walletPassword, addr) {
        const req = {
            wallet_handle_token: walletHandle,
            address: addr,
            wallet_password: walletPassword,
        };
        const res = await this.c.delete('/v1/multisig', req);
        return res.body;
    }
}
exports.default = Kmd;
//# sourceMappingURL=kmd.js.map
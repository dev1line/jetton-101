import {
    Address,
    beginCell,
    BitBuilder,
    Cell,
    Dictionary,
    DictionaryValue,
    exoticMerkleProof,
    exoticPruned,
    toNano,
    internal,
    storeStateInit,
} from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
//import { MnemonicProvider } from '@ton/blueprint';
import { jettonWalletCodeFromLibrary, promptUrl, promptUserFriendlyAddress } from '../wrappers/ui-utils';

import { WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from '@ton/ton';
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';

import '@ton/test-utils';
import { jettonContentToCell, JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet, jettonWalletConfigToCell } from '../wrappers/JettonWallet';
import { buff2bigint } from '../tests/utils';
import { Errors, Op } from '../wrappers/JettonConstants';

declare module 'express';
/*
We need to write simple server
it exposes method `/wallet/:address`:
`/wallet/:address`

`address` is raw encoded addr_std of jetton_wallet owner (NOT jetton_wallet address). (example: `0:1234567890absdef1234567890absdef1234567890absdef1234567890absdef`)
Returns full information about a particular wallet including the `CustomPayload` that should be attchaed to transfer.

MUST return a JSON object with the following fields:

| Name           | Type   | Description                                                                                      |
|----------------|--------|--------------------------------------------------------------------------------------------------|
| owner          | string | wallet owner address in raw form                                                                 |
| jetton_wallet  | string | jetton_wallet address in raw form      TODO: maybe should be removed to avoid incositency in API |
| custom_payload | string | Custom payload which wallet MUST attach to transfer message. Serialized as base64 BoC            |

MUST return some field in specific cases:

| Name            | Type   | Case                    | Description                                                                 |
|-----------------|--------|-------------------------|-----------------------------------------------------------------------------|
| state_init      | string | claim compressed jetton | State init SHOULD be attached to transfer message. Serialized as base64 BoC |
| compressed_info | object | claim compressed jetton | |


Other fields MAY be returned.

Example:

```json
{
  "owner": "0:0000000000000000000000000000000000000000000000000000000000000000",
  "jetton_wallet": "0:1234567890absdef1234567890absdef1234567890absdef1234567890absdef",
  "custom_payload": "te6cckEBBgEAeQACAAEDAUOAFa1KqA2Oswxbo4Rgh/q6NEaPLuK9o3fo1TFGn+MySjqQAgAMMi5qc29uAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQBQF4S3GMDJY/HoZd6TCREIOnCaYlF23hNzJaSsfMd1S7nBQAA8muEeQ==",
  "state_init": "te6ccgECGAEABLAAAgE0AgEBhwgBm5yw6LpMut8/oVy48oR5MjqgHd8X80GPKq12i/8q260APgFPbn4IpB/3t4HNXmxz7Qp2VJj46hROuO+ZFb+FyIegAgEU/wD0pBP0vPLICwMCAWIEBQICzAYHABug9gXaiaH0AfSB9IGoYQIB1AgJAgEgCgsAwwgxwCSXwTgAdDTAwFxsJUTXwPwDOD6QPpAMfoAMXHXIfoAMfoAMHOptAAC0x+CEA+KfqVSILqVMTRZ8AngghAXjUUZUiC6ljFERAPwCuA1ghBZXwe8upNZ8AvgXwSED/LwgABE+kQwcLry4U2ACASAMDQCD1AEGuQ9qJofQB9IH0gahgCaY/BCAvGooypEF1BCD3uy+8J3QlY+XFi6Z+Y/QAYCdAoEeQoAn0BLGeLAOeLZmT2qkAvVQPTP/oA+kAh8AHtRND6APpA+kDUMFE2oVIqxwXy4sEowv/y4sJUdAJwVCATVBQDyFAE+gJYzxYBzxbMySLIywES9AD0AMsAySD5AHB0yMsCygfL/8nQBfpA9AQx+gAg10nCAPLixCD0BD=",
    "compressed_info": {
        "amount": "1000000000",
        "start_from": "1673808578",
        "expired_at": "1721080197"
        }
}
```
*/

// on start this server reads file airdropData.boc
type AirdropData = {
    amount: bigint;
    start_from: number;
    expire_at: number;
};

const airDropValue: DictionaryValue<AirdropData> = {
    serialize: (src, builder) => {
        builder.storeCoins(src.amount);
        builder.storeUint(src.start_from, 48);
        builder.storeUint(src.expire_at, 48);
    },
    parse: (src) => {
        return {
            amount: src.loadCoins(),
            start_from: src.loadUint(48),
            expire_at: src.loadUint(48),
        };
    },
};

// airdropData.boc contains serialized airdrop dictionary
// read file as Buffer
const fs = require('fs');
const airdropDataBuffer = fs.readFileSync('airdropData.boc');
// parse buffer to cell
const airdropCell = Cell.fromBoc(airdropDataBuffer)[0];
let airdropData = Dictionary.loadDirect(Dictionary.Keys.Address(), airDropValue, airdropCell);
let merkleRoot = buff2bigint(airdropCell.hash(0));

//minter address is stored in file minter.json
const minterBuffer = fs.readFileSync('minter.json');
//parse json
const minterData = JSON.parse(minterBuffer.toString());
const minter = Address.parse(minterData.address);

let wallet_code_raw = beginCell().endCell();

(async () => {
    wallet_code_raw = await compile('JettonWallet');
})();
const wallet_code = jettonWalletCodeFromLibrary(wallet_code_raw);

/* then necessary data can be extracted from airdropData as
```
            let airdrop = airdropData.get(Address.parse(address as string));
            let amount = airdrop!.amount;
            let start_from = airdrop!.start_from;
            let expire_at = airdrop!.expire_at;
            let receiverProof = airdropData.generateMerkleProof(Address.parse(address as string));
            //serialize receiverProof: toBoc, then Buffer to base64
            let serializedProof = receiverProof.toBoc().toString('base64');
```
*/

// start server
import express from 'express';
import { Request, Response } from 'express';
const app = express();
const port = 3000;

app.get('/wallet/:address', (req: Request, res: Response) => {
    let address = req.params.address;
    let owner = Address.parse(address as string);
    let airdrop = airdropData.get(owner);
    if (airdrop === undefined) {
        res.json({}); // return empty object if no airdrop data for this address
        return;
    }
    let amount = airdrop!.amount;
    let start_from = airdrop!.start_from;
    let expire_at = airdrop!.expire_at;
    let receiverProof = airdropData.generateMerkleProof(owner);
    //serialize receiverProof: toBoc, then Buffer to base64
    let serializedProof = receiverProof.toBoc().toString('base64');
    const claimPayload = JettonWallet.claimPayload(receiverProof);
    let custom_payload = claimPayload.toBoc().toString('base64');

    let jettonWalletContract = JettonWallet.createFromConfig(
        { ownerAddress: owner, jettonMasterAddress: minter, merkleRoot: merkleRoot, salt: 0n },
        wallet_code,
    );

    let stateInitB = beginCell();
    storeStateInit(jettonWalletContract.init!)(stateInitB);
    let stateInit = stateInitB.endCell();

    res.json({
        owner: owner.toRawString(),
        jetton_wallet: jettonWalletContract.address.toRawString(),
        custom_payload,
        state_init: stateInit.toBoc().toString('base64'),
        compressed_info: {
            amount: amount.toString(),
            start_from: start_from.toString(),
            expired_at: expire_at.toString(),
        },
    });
});

app.listen(port, () => {
    console.log(`Server started at http://localhost:${port}`);
});

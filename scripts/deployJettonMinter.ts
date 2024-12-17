import { toNano, Cell } from '@ton/core';
import { JettonMinter } from '../wrappers/JettonMinter';
import { compile, NetworkProvider } from '@ton/blueprint';
import { jettonWalletCodeFromLibrary, promptBigInt, promptUrl, promptUserFriendlyAddress } from '../wrappers/ui-utils';

import { hex as jettonMinterHex } from '../build/jetton-minter.compiled.json';
import { hex as jettonWalletHex } from '../build/jetton-wallet.compiled.json';
import { hex as testMinterHex } from '../build/test-minter.compiled.json';

// Code cells from build output
export const jettonMinterCodeCell = Cell.fromBoc(Buffer.from(jettonMinterHex, 'hex'))[0];
export const jettonWalletCodeCell = Cell.fromBoc(Buffer.from(jettonWalletHex, 'hex'))[0];
export const testMinterCodeCell = Cell.fromBoc(Buffer.from(testMinterHex, 'hex'))[0];

export async function run(provider: NetworkProvider) {
    const isTestnet = provider.network() !== 'mainnet';

    const ui = provider.ui();
    const jettonWalletCodeRaw = jettonWalletCodeCell; // await compile('JettonWallet');

    const adminAddress = await promptUserFriendlyAddress(
        'Enter the address of the jetton owner (admin):',
        ui,
        isTestnet,
    );

    // e.g "https://bridge.ton.org/token/1/0x111111111117dC0aa78b770fA6A738034120C302.json"
    const jettonMetadataUri = await promptUrl('Enter jetton metadata uri (https://jettonowner.com/jetton.json)', ui);
    const merkleRoot = await promptBigInt('Enter merkle root', ui);

    const jettonWalletCode = jettonWalletCodeFromLibrary(jettonWalletCodeRaw);

    const minter = provider.open(
        JettonMinter.createFromConfig(
            {
                admin: adminAddress.address,
                wallet_code: jettonWalletCode,
                merkle_root: merkleRoot,
                jetton_content: { uri: jettonMetadataUri },
            },
            jettonMinterCodeCell, // await compile('JettonMinter')
        ),
    );

    await minter.sendDeploy(provider.sender(), toNano('1.5')); // send 1.5 TON
    // Will display resulting contract address
    await provider.waitForDeploy(minter.address);
}

import { compile, NetworkProvider } from '@ton/blueprint';
import { jettonWalletCodeFromLibrary, promptUserFriendlyAddress } from '../wrappers/ui-utils';
import { checkJettonWallet } from '../wrappers/JettonWalletChecker';
import { Cell } from '@ton/core';

import { hex as jettonMinterHex } from '../build/jetton-minter.compiled.json';
import { hex as jettonWalletHex } from '../build/jetton-wallet.compiled.json';
import { hex as testMinterHex } from '../build/test-minter.compiled.json';

export const jettonMinterCodeCell = Cell.fromBoc(Buffer.from(jettonMinterHex, 'hex'))[0];
export const jettonWalletCodeCell = Cell.fromBoc(Buffer.from(jettonWalletHex, 'hex'))[0];
export const testMinterCodeCell = Cell.fromBoc(Buffer.from(testMinterHex, 'hex'))[0];

export async function run(provider: NetworkProvider) {
    const isTestnet = provider.network() !== 'mainnet';

    const ui = provider.ui();

    const jettonMinterCode = jettonMinterCodeCell; //await compile('JettonMinter');
    const jettonWalletCodeRaw = jettonWalletCodeCell; // await compile('JettonWallet');
    const jettonWalletCode = jettonWalletCodeFromLibrary(jettonWalletCodeRaw);

    const jettonWalletAddress = await promptUserFriendlyAddress(
        'Enter the address of the jetton wallet',
        ui,
        isTestnet,
    );

    try {
        await checkJettonWallet(
            jettonWalletAddress,
            jettonMinterCode,
            jettonWalletCode,
            provider,
            ui,
            isTestnet,
            false,
        );
    } catch (e: any) {
        ui.write(e.message);
        return;
    }
}

import { Address, Cell, fromNano, OpenedContract } from '@ton/core';
import { NetworkProvider, UIProvider } from '@ton/blueprint';
import { addressToString, assert, base64toCell, formatAddressAndUrl, parseContentCell, sendToIndex } from './ui-utils';
import { JettonWallet, parseJettonWalletData } from './JettonWallet';
import { JettonMinter } from './JettonMinter';
import { fromUnits } from './units';

export const checkJettonWallet = async (
    jettonWalletAddress: {
        isBounceable: boolean;
        isTestOnly: boolean;
        address: Address;
    },
    jettonMinterCode: Cell,
    jettonWalletCode: Cell,
    provider: NetworkProvider,
    ui: UIProvider,
    isTestnet: boolean,
    silent: boolean,
) => {
    const write = (message: string) => {
        if (!silent) {
            ui.write(message);
        }
    };

    // Account State and Data

    const result = await sendToIndex(
        'account',
        {
            address: addressToString(jettonWalletAddress),
            include_boc: true,
            api_key: 'a0c63601146cbfd144e8019c0ba231948db37eb26362aee91163be724856be71',
        },
        provider,
    );
    write('Contract status: ' + JSON.stringify(result));

    assert(result.status === 'active', 'Contract not active', ui);

    if (base64toCell(result.code).equals(jettonWalletCode)) {
        write('The contract code matches the jetton-wallet code from this repository');
    } else {
        throw new Error('The contract code DOES NOT match the jetton-wallet code from this repository');
    }

    write('Toncoin balance on jetton-wallet: ' + fromNano(result.balance) + ' TON');

    const data = base64toCell(result.data);
    const parsedData = parseJettonWalletData(data);
    console.log('parsedData', parsedData);
    // Check in jetton-minter

    const jettonMinterContract: OpenedContract<JettonMinter> = provider.open(
        JettonMinter.createFromAddress(parsedData.jettonMasterAddress),
    );
    const jettonWalletAddress2 = await jettonMinterContract.getWalletAddress(parsedData.ownerAddress);
    console.log('jettonWalletAddress from minter address', jettonWalletAddress2);
    assert(jettonWalletAddress2.equals(jettonWalletAddress.address), 'fake jetton-minter', ui);

    const { content } = await jettonMinterContract.getJettonData();
    let decimals: number;
    const parsedContent = await parseContentCell(content);
    console.log('content', parsedContent);
    if (parsedContent instanceof String) {
        throw new Error('content not HashMap');
    } else {
        const contentMap: any = parsedContent;
        console.assert(contentMap['uri'], content, "Metadata URL doesn't match");

        const decimalsString = contentMap['decimals'];
        decimals = parseInt(decimalsString);
        if (isNaN(decimals)) {
            throw new Error('invalid decimals');
        }
    }

    // Get-methods

    const jettonWalletContract: OpenedContract<JettonWallet> = provider.open(
        JettonWallet.createFromAddress(jettonWalletAddress.address),
    );
    const getData = await jettonWalletContract.getWalletData();

    assert(getData.balance === parsedData.balance, "Balance doesn't match", ui);
    assert(getData.owner.equals(parsedData.ownerAddress), "Owner address doesn't match", ui);
    assert(getData.minter.equals(parsedData.jettonMasterAddress), "Jetton master address doesn't match", ui);
    assert(getData.wallet_code.equals(jettonWalletCode), "Jetton wallet code doesn't match", ui);

    // StateInit

    const jettonWalletContract2 = JettonWallet.createFromConfig(
        {
            ownerAddress: parsedData.ownerAddress,
            jettonMasterAddress: parsedData.jettonMasterAddress,
            merkleRoot: 1n, //parsedData.merkleRoot as number,
            salt: parsedData.balance,
        },
        jettonWalletCode,
    );

    if (jettonWalletContract2.address.equals(jettonWalletAddress.address)) {
        write('StateInit matches');
    }

    // Print

    write('Jetton-wallet status: ' + parsedData.status);
    write('Balance: ' + fromUnits(parsedData.balance, decimals));
    write('Owner address: ' + (await formatAddressAndUrl(parsedData.ownerAddress, provider, isTestnet)));
    write('Jetton-minter address: ' + (await formatAddressAndUrl(parsedData.jettonMasterAddress, provider, isTestnet)));

    return {
        jettonWalletContract,
        jettonBalance: parsedData.balance,
    };
};

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
} from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
//import { MnemonicProvider } from '@ton/blueprint';
import { jettonWalletCodeFromLibrary, promptUrl, promptUserFriendlyAddress } from '../wrappers/ui-utils';

import { WalletContractV4, WalletContractV5R1 } from '@ton/ton';
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';

import '@ton/test-utils';
import { jettonContentToCell, JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet, jettonWalletConfigToCell } from '../wrappers/JettonWallet';
import { buff2bigint } from '../tests/specs/utils';
import { Errors, Op } from '../wrappers/JettonConstants';

import { hex as jettonMinterHex } from '../build/jetton-minter.compiled.json';
import { hex as jettonWalletHex } from '../build/jetton-wallet.compiled.json';
import { hex as testMinterHex } from '../build/test-minter.compiled.json';
import dotenv from 'dotenv';
dotenv.config();
// Code cells from build output
export const jettonMinterCodeCell = Cell.fromBoc(Buffer.from(jettonMinterHex, 'hex'))[0];
export const jettonWalletCodeCell = Cell.fromBoc(Buffer.from(jettonWalletHex, 'hex'))[0];
export const testMinterCodeCell = Cell.fromBoc(Buffer.from(testMinterHex, 'hex'))[0];
const path = require('path');
const fs = require('fs');
const N = 2; // number of wallets of each kind to generate
const P = 1; // number of packages of wallets to generate

const AIRDROP_START = 1722366929;
const AIRDROP_END = 1761320829;

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

function convertToMerkleProof(c: Cell): Cell {
    return beginCell()
        .storeUint(3, 8)
        .storeBuffer(c.hash(0))
        .storeUint(c.depth(0), 16)
        .storeRef(c)
        .endCell({ exotic: true });
}

function convertToPrunedBranch(c: Cell): Cell {
    return beginCell()
        .storeUint(1, 8)
        .storeUint(1, 8)
        .storeBuffer(c.hash(0))
        .storeUint(c.depth(0), 16)
        .endCell({ exotic: true });
}

// for P packages it generates 3 * N wallets of each kind
// for each wallet it generates airdrop data with random amount from toNano("1") to toNano("23"), start_from = AIRDROP_START
// and expire_at linearly increased from AIRDROP_START to AIRDROP_END in each package and each wallet type

const JWT = process.env.PINATA_JWT;

export async function upload(dataSteam: Buffer) {
    try {
        const formData = new FormData();
        // const airdropDataPath = path.join(__dirname, 'airdropData.boc');
        // const fileBlob = new Blob([fs.readFileSync(airdropDataPath)]);
        const fileBlob = new Blob([dataSteam]);
        const file = new File([fileBlob], 'airdropData.boc');
        formData.append('file', file);
        formData.append('pinataMetadata', '{\n  "name": "airdropData.boc"\n}');
        formData.append('pinataOptions', '{\n  "cidVersion": 1\n}');

        const options = {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${JWT}`,
                // 'Content-Type': 'multipart/form-data'
            },
            body: formData,
        };

        const link = fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', options)
            .then((response) => response.json())
            .then((response) => {
                console.log(response);
                return 'https://maroon-wasteful-cow-737.mypinata.cloud/ipfs/' + response.IpfsHash;
            })
            .catch((err) => console.error(err));
        return link;
    } catch (error) {
        console.log(error);
    }
}

export async function uploadJSON(data: any) {
    try {
        const body = {
            pinataOptions: {
                cidVersion: 1,
            },
            pinataMetadata: {
                name: 'metadata.json',
            },
            pinataContent: data,
        };
        const options = {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${JWT}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        };

        const link = fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', options)
            .then((response) => response.json())
            .then((response) => {
                console.log(response);
                return 'https://maroon-wasteful-cow-737.mypinata.cloud/ipfs/' + response.IpfsHash;
            })
            .catch((err) => console.error(err));

        return link;
    } catch (error) {
        console.log(error);
        return '';
    }
}
export async function generateWalletsWithAirdropData() {
    const allWallets = [];
    let workchain = 0;
    let totalSupply = 0n;
    let airdropData = Dictionary.empty(Dictionary.Keys.Address(), airDropValue);
    for (let pack = 0; pack < P; pack++) {
        let wallets = [];
        // for (let i = 0; i < N; i++) {
        //     const mnemonic = await mnemonicNew();
        //     const keyPair = await mnemonicToPrivateKey(mnemonic);
        //     let wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
        //     //generate airdrop data
        //     let amount = toNano((Math.ceil(Math.random() * 22) + 1).toString());
        //     totalSupply += amount;
        //     let start_from = AIRDROP_START;
        //     let expire_at = Math.ceil(AIRDROP_START + ((AIRDROP_END - AIRDROP_START) * (i + 1)) / N);
        //     airdropData.set(wallet.address, { amount, start_from, expire_at });
        //     wallets.push([mnemonic, 'v3r2', wallet.address.toString()]);
        // }
        const mnemonics = fs.readFileSync('mnemonic.txt', 'utf8');
        const mnemonic = mnemonics.split('\n');
        for (let i = 0; i < mnemonic.length; i++) {
            // for (let i = 0; i < N; i++) {

            // const mnemonic = await mnemonicNew();
            // const keyPair = await mnemonicToPrivateKey(mnemonic);
            let keyPair = await mnemonicToPrivateKey([mnemonic[i]]);
            let wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
            //generate airdrop data
            let amount = toNano((Math.ceil(Math.random() * 22) + 1).toString());
            totalSupply += amount;
            let start_from = AIRDROP_START;
            let expire_at = Math.ceil(AIRDROP_START + ((AIRDROP_END - AIRDROP_START) * (i + 1)) / N);
            airdropData.set(wallet.address, { amount, start_from, expire_at });
            wallets.push([mnemonic[i], 'v4', wallet.address.toString()]);
        }
        // for (let i = 0; i < N; i++) {
        //     const mnemonic = await mnemonicNew();
        //     const keyPair = await mnemonicToPrivateKey(mnemonic);
        //     let wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, walletId: { networkGlobalId: -3 } });
        //     //generate airdrop data
        //     let amount = toNano((Math.ceil(Math.random() * 22) + 1).toString());
        //     totalSupply += amount;
        //     let start_from = AIRDROP_START;
        //     let expire_at = Math.ceil(AIRDROP_START + ((AIRDROP_END - AIRDROP_START) * (i + 1)) / N);
        //     airdropData.set(wallet.address, { amount, start_from, expire_at });
        //     wallets.push([mnemonic, 'v5r1', wallet.address.toString()]);
        // }
        allWallets.push(wallets);
    }
    let airdropCell = beginCell().storeDictDirect(airdropData).endCell();
    let merkleRoot = buff2bigint(airdropCell.hash(0));
    //receiverProof = airdropData.generateMerkleProof(testReceiver.address);
    // Now we want to iterate over all wallets and generate proof for each of them
    // finally for each pack we want to store into csv file the following data
    // mnemonic, wallet type, wallet address, airdrop amount, airdrop start_from, airdrop expire_at, receiver proof

    for (let pack = 0; pack < P; pack++) {
        let wallets = allWallets[pack];
        let csvData = [];
        for (let i = 0; i < wallets.length; i++) {
            let mnemonic = wallets[i][0];
            let type = wallets[i][1];
            let address = wallets[i][2];
            let airdrop = airdropData.get(Address.parse(address as string));
            let amount = airdrop!.amount;
            let start_from = airdrop!.start_from;
            let expire_at = airdrop!.expire_at;
            let receiverProof = airdropData.generateMerkleProof(Address.parse(address as string));
            //serialize receiverProof: toBoc, then Buffer to base64
            let serializedProof = receiverProof.toBoc().toString('base64');
            csvData.push([mnemonic, type, address, amount, start_from, expire_at, serializedProof]);
        }

        // write csvData to csv file
        // dont use csv libraries
        // write csv header
        let csv = 'mnemonic, type, address, amount, start_from, expire_at, receiver_proof\n';
        for (let i = 0; i < csvData.length; i++) {
            csv += csvData[i].join(',') + '\n';
        }
        fs.writeFileSync(`wallets${pack}.csv`, csv);
    }

    // store serialized airdropCell to file as buffer
    let serializedAirdropCell = airdropCell.toBoc();
    fs.writeFileSync('airdropData.boc', serializedAirdropCell);
    fs.writeFileSync('merkleRoot.txt', merkleRoot.toString());

    // upload airdropData.boc to IPFS
    // const linkIPFS = await upload(serializedAirdropCell);

    return { merkleRoot, allWallets, airdropData, totalSupply };
}

export async function run(provider: NetworkProvider) {
    const isTestnet = provider.network() !== 'mainnet';

    const uri = {
        name: 'Mintless Jetton',
        symbol: 'DONE',
        decimals: '9',
        image: 'https://avatars.githubusercontent.com/u/43717681?v=4&size=64',
        description: 'Unleash your new technology blockchain',
        custom_payload_api_uri: 'http://claim.dev1line.store/jettons/EQCJR4KmB9-X34Ke4Y-iPWG8ws7JSBkE6FN5ChMdnS3TGYFy/',
    };
    const jettonMetadataUri = (await uploadJSON(uri)) as string;
    console.log('jettonMetadataUri', jettonMetadataUri);

    let wallet_code_raw = jettonWalletCodeCell; //await compile('JettonWallet');
    const wallet_code = jettonWalletCodeFromLibrary(wallet_code_raw);
    let minter_code = jettonMinterCodeCell; // await compile('JettonMinter');
    console.log('jettonMetadataUri', jettonMetadataUri);
    console.log('content', jettonContentToCell({ uri: jettonMetadataUri }));
    const ui = provider.ui();
    const adminAddress = await promptUserFriendlyAddress(
        'Enter the address of the jetton owner (admin):',
        ui,
        isTestnet,
    );

    let data = await generateWalletsWithAirdropData();

    // const jettonMetadataUri = await promptUrl('Enter jetton metadata uri (https://jettonowner.com/jetton.json)', ui);

    let merkleRoot = data.merkleRoot;

    let minterContract = JettonMinter.createFromFullConfig(
        {
            admin: adminAddress.address,
            wallet_code: wallet_code,
            merkle_root: merkleRoot,
            jetton_content: jettonContentToCell({ uri: jettonMetadataUri }),
            supply: data.totalSupply,
            transfer_admin: null,
        },
        minter_code,
    );
    let minter = provider.open(minterContract);
    await minter.sendDeploy(provider.sender(), toNano('0.05'));

    // const minterFile = fs.readFileSync('minter.json', 'utf8');
    // const minter = {
    //     address: JSON.parse(minterFile).address,
    // };
    // const jettonMinterContract = provider.open(JettonMinter.createFromAddress(Address.parse(minter.address)));
    // const jettonMinter = JettonMinter.createFromAddress(minter.address);
    // await provider.waitForDeploy(minter.address);
    console.log('Minter deployed at address: ', minter.address.toString());
    // save minter address to file minter.json
    fs.writeFileSync('minter.json', JSON.stringify({ address: minter.address.toString() }));

    // now lets send 1 TON to first wallet of first package
    const account = fs.readFileSync('mnemonic.txt', 'utf8');
    let mnemonic1 = account.split('\n')[0];
    let mnemonic2 = account.split('\n')[1];
    // let mnemonic =
    //     'pluck cram engage game vendor job output drink congress guide apart voyage brain cart engine innocent bargain game ceiling asthma festival charge govern bachelor'; //allWallets[0][0][0] as string[];
    let keyPair = await mnemonicToPrivateKey([mnemonic1]);
    let walletContract = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
    let wallet = provider.open(walletContract);

    let keyPair2 = await mnemonicToPrivateKey([mnemonic2]);
    let walletContract2 = WalletContractV4.create({ workchain: 0, publicKey: keyPair2.publicKey });
    let wallet2 = provider.open(walletContract2);
    // wait 40 seconds
    console.log('Wallet address: ', wallet.address.toString());
    await new Promise((resolve) => setTimeout(resolve, 40000));
    await provider.sender().send({
        to: wallet.address,
        value: toNano('0.01'),
    });
    let walletSender = wallet.sender(keyPair.secretKey);
    let walletSender2 = wallet2.sender(keyPair2.secretKey);
    // let walletSender2 = wallet2.sender(keyPair2.secretKey);
    console.log('Wallet address: ', wallet.address.toString());
    console.log('Wallet address 2: ', wallet2.address.toString());
    //now lets create jetton wallet owned by wallet
    let jettonWalletContract = JettonWallet.createFromConfig(
        {
            ownerAddress: wallet.address,
            jettonMasterAddress: minter.address,
            merkleRoot: merkleRoot,
            salt: await minter.getWalletSalt(wallet.address),
        },
        wallet_code,
    );
    let jettonWallet = provider.open(jettonWalletContract);

    //deserialize proof
    let receiverProof = data.airdropData.generateMerkleProof(wallet.address);
    const claimPayload = JettonWallet.claimPayload(receiverProof);

    await jettonWallet.sendTransfer(
        walletSender,
        toNano('0.3'),
        toNano('1'),
        wallet2.address,
        wallet.address,
        claimPayload,
        toNano('0.05'),
    );
}

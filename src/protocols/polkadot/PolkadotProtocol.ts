import axios, { AxiosResponse } from '../../dependencies/src/axios-0.19.0'
import { FeeDefaults, CurrencyUnit, ICoinProtocol } from '../ICoinProtocol'
import { NonExtendedProtocol } from '../NonExtendedProtocol'
import { PolkadotNodeClient } from './PolkadotNodeClient'
import BigNumber from '../../dependencies/src/bignumber.js-9.0.0/bignumber'
import { createSr25519KeyPair } from '../../utils/sr25519'
import { encodeAddress, decodeAddress } from './utils/address'
import { IAirGapTransaction } from '../..'
import { PolkadotTransaction, PolkadotTransactionType } from './transaction/PolkadotTransaction'
import { UnsignedPolkadotTransaction } from '../../serializer/schemas/definitions/transaction-sign-request-polkadot'
import { SignedPolkadotTransaction } from '../../serializer/schemas/definitions/transaction-sign-response-polkadot'
import { sign } from './transaction/sign'
import { PolkadotTransactionPayload } from './transaction/PolkadotTransactionPayload'
import { PolkadotRewardDestination } from './staking/PolkadotRewardDestination'
import { isString } from 'util'
import { RawPolkadotTransaction } from '../../serializer/types'
import { bip39ToMiniSecret } from '@polkadot/wasm-crypto'
import { PolkadotValidatorDetails } from './staking/PolkadotValidatorDetails'

export class PolkadotProtocol extends NonExtendedProtocol implements ICoinProtocol {    
    public symbol: string = 'DOT'
    public name: string = 'Polkadot'
    public marketSymbol: string = 'DOT'
    public feeSymbol: string = 'DOT'

    public decimals: number = 12;
    public feeDecimals: number = 12;
    public identifier: string = 'polkadot';

    // TODO: set better values
    public feeDefaults: FeeDefaults = {
        low: '0.01', // 10 000 000 000
        medium: '0.01',
        high: '0.01'
    }

    public units: CurrencyUnit[] = [
        {
            unitSymbol: 'DOT',
            factor: '1'
        },
        {
            unitSymbol: 'mDOT',
            factor: '0.001'
        },
        {
            unitSymbol: 'uDOT',
            factor: '0.000001'
        },
        {
            unitSymbol: 'Point',
            factor: '0.000000001'
        },
        {
            unitSymbol: 'Planck',
            factor: '0.000000000001'
        }
    ]

    public supportsHD: boolean = false
    public standardDerivationPath: string = `m/44'/354'/0'/0/0` // TODO: verify

    public addressIsCaseSensitive: boolean = false
    public addressValidationPattern: string = '^[a-km-zA-HJ-NP-Z1-9]+$' // TODO: set length?
    public addressPlaceholder: string = 'ABC...' // TODO: better placeholder?

    public blockExplorer: string = 'https://polkascan.io/pre/kusama'

    private blockExplorerApi: string = 'https://api-01.polkascan.io/kusama/api/v1'

    constructor(
        readonly nodeClient: PolkadotNodeClient = new PolkadotNodeClient('https://polkadot-kusama-node-1.kubernetes.papers.tech')
    ) { super() }

    public async getBlockExplorerLinkForAddress(address: string): Promise<string> {
        return `${this.blockExplorer}/account/${address}` // it works for both Address and AccountId
    }

    public async getBlockExplorerLinkForTxId(txId: string): Promise<string> {
        return `${this.blockExplorer}/extrinsic/${txId}`
    }

    public async getPublicKeyFromMnemonic(mnemonic: string, derivationPath: string, password?: string): Promise<string> {
        const secret = bip39ToMiniSecret(mnemonic, password || '')
        return this.getPublicKeyFromHexSecret(Buffer.from(secret).toString('hex'), derivationPath)
    }
    
    public async getPrivateKeyFromMnemonic(mnemonic: string, derivationPath: string, password?: string): Promise<Buffer> {
        const secret = bip39ToMiniSecret(mnemonic, password || '')
        return this.getPrivateKeyFromHexSecret(Buffer.from(secret).toString('hex'), derivationPath)
    }

    public async getPublicKeyFromHexSecret(secret: string, derivationPath: string): Promise<string> {
        const keyPair = await createSr25519KeyPair(secret, derivationPath)
        return keyPair.publicKey.toString('hex')
    }

    public async getPrivateKeyFromHexSecret(secret: string, derivationPath: string): Promise<Buffer> {
        const keyPair = await createSr25519KeyPair(secret, derivationPath)
        return keyPair.privateKey
    }

    public async getAddressFromPublicKey(publicKey: string): Promise<string> {
        return encodeAddress(publicKey)
    }
    
    public async getAddressesFromPublicKey(publicKey: string): Promise<string[]> {
        return [await this.getAddressFromPublicKey(publicKey)]
    }
    
    public async getTransactionsFromPublicKey(publicKey: string, limit: number, offset: number): Promise<IAirGapTransaction[]> {
        return this.getTransactionsFromAddresses([encodeAddress(publicKey)], limit, offset)
    }
    
    public async getTransactionsFromAddresses(addresses: string[], limit: number, offset: number): Promise<IAirGapTransaction[]> {
        const pageNumber = Math.ceil(offset / limit) + 1
        
        const responses: AxiosResponse[] = await Promise.all(
            addresses.map(address => axios.get(`${this.blockExplorerApi}/balances/transfer?&filter[address]=${address}&page[size]=${limit}&page[number]=${pageNumber}`))
        )

        return responses.map(response => response.data.data)
            .reduce((flatten, toFlatten) => flatten.concat(toFlatten), [])
            .filter(transfer => transfer.type === 'balancetransfer')
            .map(transfer => {
                const destination = encodeAddress(transfer.attributes.destination.id)
                return {
                    protocolIdentifier: this.identifier,
                    from: [encodeAddress(transfer.attributes.sender.id)],
                    to: [destination],
                    isInbound: addresses.includes(destination),
                    amount: transfer.attributes.value,
                    fee: transfer.attributes.fee,
                    hash: transfer.id,
                    blockHeight: transfer.attributes.block_id
                }
            })
    }
    
    public async signWithPrivateKey(privateKey: Buffer, rawTransaction: RawPolkadotTransaction): Promise<string> {
        const unsigned = PolkadotTransaction.fromRaw(rawTransaction)

        const signed = await sign(privateKey, unsigned, rawTransaction.payload)

        return JSON.stringify({
            type: signed.type.toString(),
            fee: rawTransaction.fee,
            encoded: signed.encode(),
            payload: rawTransaction.payload
        })
    }
    
    public async getTransactionDetails(transaction: UnsignedPolkadotTransaction): Promise<IAirGapTransaction[]> {
        return this.getTransactionDetailsFromRaw(transaction.transaction)
    }
    
    public async getTransactionDetailsFromSigned(transaction: SignedPolkadotTransaction): Promise<IAirGapTransaction[]> {
        const rawTransaction = JSON.parse(transaction.transaction) as RawPolkadotTransaction
        return this.getTransactionDetailsFromRaw(rawTransaction)
    }

    public async getBalanceOfAddresses(addresses: string[]): Promise<string> {
        const promises: Promise<BigNumber>[] = addresses.map(address => {
            const accountId = decodeAddress(address)
            return this.nodeClient.getBalance(accountId)
        })
        const balances = await Promise.all(promises)
        const balance = balances.reduce((current: BigNumber, next: BigNumber) => current.plus(next))

        return balance.toString(10)
    }

    public async getBalanceOfPublicKey(publicKey: string): Promise<string> {
        return this.getBalanceOfAddresses([await this.getAddressFromPublicKey(publicKey)])        
    }

    public async getTransferFeeEstimate(publicKey: string, destination: string, value: string, tip: string = '0'): Promise<string> {
        const transaction = await this.prepareTransaction(PolkadotTransactionType.TRANSFER, publicKey, tip, { 
            to: destination.length > 0 ? destination : encodeAddress(publicKey), 
            value: new BigNumber(value) 
        })
        const fee = await this.calculateTransactionFee(transaction)

        if (!fee) {
            return Promise.reject('Could not fetch all necessary data.')
        }

        return fee.toString(10)
    }

    public prepareTransactionFromPublicKey(publicKey: string, recipients: string[], values: string[], fee: string, data?: any): Promise<RawPolkadotTransaction> {
        if  (recipients.length !== 1 && values.length !== 1) {
            return Promise.reject('only single transactions are supported')
        }

        return this.prepareSignableTransaction(PolkadotTransactionType.TRANSFER, publicKey, 0, { to: recipients[0], value: new BigNumber(values[0]) })
    }

    public prepareTransactionsFromPublicKey(publicKey: string, txConfig: { type: PolkadotTransactionType, fee: string | number | BigNumber, args: any }[]): Promise<RawPolkadotTransaction[]> {
        return Promise.all(
            txConfig.map((tx, index) => this.prepareSignableTransaction(tx.type, publicKey, tx.fee, tx.args, index))
        )
    }

    public async broadcastTransaction(rawTransaction: string): Promise<string> {
        const encoded = (JSON.parse(rawTransaction) as RawPolkadotTransaction).encoded
        const result = await this.nodeClient.submitTransaction(encoded)
        
        return result ? result : Promise.reject('Error while submitting the transaction.')
    }

    private async prepareSignableTransaction(type: PolkadotTransactionType, publicKey: string, tip: string | number | BigNumber, args: any = {}, index: number | BigNumber = 0): Promise<RawPolkadotTransaction> {
        const results = await Promise.all([
            this.getBalanceOfPublicKey(publicKey),
            this.prepareTransaction(type, publicKey, tip, args, index),
            this.nodeClient.getLastBlockHash(),
            this.nodeClient.getFirstBlockHash(),
            this.nodeClient.getSpecVersion(),
        ])

        if (results.some(result => result === null)) {
            return Promise.reject('Could not fetch all necessary data.')
        }

        const currentBalance = new BigNumber(results[0]!)

        const transaction = results[1]!

        const fee = await this.calculateTransactionFee(transaction)
        if (!fee) {
            return Promise.reject('Could not fetch all necessary data.')
        }

        if (currentBalance.lt(fee)) {
            throw new Error('Not enough balance')
        }

        const lastHash = results[2]!
        const genesisHash = results[3]!
        const specVersion = results[4]!

        const payload = PolkadotTransactionPayload.create(transaction, {
            specVersion,
            genesisHash,
            lastHash
        })

        return {
            type: type.toString(),
            fee: fee.toString(),
            encoded: transaction.encode(),
            payload: payload.encode()
        }
    }

    private async prepareTransaction(type: PolkadotTransactionType, publicKey: string, tip: string | number | BigNumber, args: any = {}, index: number | BigNumber = 0): Promise<PolkadotTransaction> {
        const results = await Promise.all([
            this.nodeClient.getCurrentHeight(),
            this.nodeClient.getNonce(publicKey),
            this.nodeClient.getTransactionMetadata(type)
        ])

        if (results.some(result => result === null)) {
            return Promise.reject('Could not fetch all necessary data.')
        }

        const chainHeight = results[0]!
        const nonce = results[1]!.plus(index)
        const methodId = results[2]!

        return PolkadotTransaction.create(type, {
            from: publicKey,
            tip: BigNumber.isBigNumber(tip) ? tip : new BigNumber(tip),
            methodId,
            args,
            era: { chainHeight },
            nonce
        })
    }

    private async calculateTransactionFee(transaction: PolkadotTransaction): Promise<BigNumber | null> {
        const partialEstimate = await this.nodeClient.getTransferFeeEstimate(transaction.encode())

        return partialEstimate?.plus(transaction.tip.value) || null
    }
    
    private async getTransactionDetailsFromRaw(rawTransaction: RawPolkadotTransaction): Promise<IAirGapTransaction[]> {
        const polkadotTransaction = PolkadotTransaction.fromRaw(rawTransaction)

        return [{
            from: [],
            to: [],
            amount: '',
            fee: rawTransaction.fee,
            protocolIdentifier: this.identifier,
            isInbound: false,
            ...polkadotTransaction.toAirGapTransaction()
        }]
    }

    // Delegation

    public prepareBondTransaction(
        publicKey: string,
        controller: string, 
        value: string | number | BigNumber, 
        payee: string | PolkadotRewardDestination, 
        fee: string | number | BigNumber = 0
    ): Promise<RawPolkadotTransaction> {
        return this.prepareSignableTransaction(PolkadotTransactionType.BOND, publicKey, fee, {
            controller,
            value: BigNumber.isBigNumber(value) ? value : new BigNumber(value),
            payee: isString(payee) ? PolkadotRewardDestination[payee] :  payee   
        })
    }

    public prepareUnbondTransaction(publicKey: string, value: string | number | BigNumber, fee: string | number | BigNumber = 0): Promise<RawPolkadotTransaction> {
        return this.prepareSignableTransaction(PolkadotTransactionType.UNBOND, publicKey, fee, {
            value: BigNumber.isBigNumber(value) ? value : new BigNumber(value)
        })
    }

    public prepareNominateTransaction(publicKey: string, targets: string[], tip: string | number | BigNumber = 0): Promise<RawPolkadotTransaction> {
        return this.prepareSignableTransaction(PolkadotTransactionType.NOMINATE, publicKey, tip, { targets })
    }

    public prepareStopNominatingTransaction(publicKey: string, tip: string | number | BigNumber = 0): Promise<RawPolkadotTransaction> {
        return this.prepareSignableTransaction(PolkadotTransactionType.STOP_NOMINATING, publicKey, tip)
    }

    public async isPublicKeyDelegating(publicKey: string): Promise<boolean> {
        const nominations = await this.nodeClient.getNominations(publicKey)
        return nominations != null
    }

    public isAddressDelegating(address: string): Promise<boolean> { 
        return this.isPublicKeyDelegating(decodeAddress(address).toString('hex'))
    }

    public getValidatorDetails(validator: string): Promise<PolkadotValidatorDetails> {
        return this.nodeClient.getValidatorDetails(decodeAddress(validator))
    }

    public signMessage(message: string, privateKey: Buffer): Promise<string> {
        throw new Error('Method not implemented.');
    }
    
    public verifyMessage(message: string, signature: string, publicKey: Buffer): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
}
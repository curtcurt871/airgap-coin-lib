import { AxiosError } from '../../dependencies/src/axios-0.19.0'
import BigNumber from '../../dependencies/src/bignumber.js-9.0.0/bignumber'
import { NetworkError } from '../../errors'
import { Domain } from '../../errors/coinlib-error'
import { AirGapTransactionStatus, IAirGapTransaction } from '../../interfaces/IAirGapTransaction'
import { SignedSubstrateTransaction } from '../../serializer/schemas/definitions/signed-transaction-substrate'
import { UnsignedSubstrateTransaction } from '../../serializer/schemas/definitions/unsigned-transaction-substrate'
import { RawSubstrateTransaction } from '../../serializer/types'
import { assertFields } from '../../utils/assert'
import { ProtocolSymbols } from '../../utils/ProtocolSymbols'
import { DelegateeDetails, DelegationDetails, DelegatorDetails, ICoinDelegateProtocol } from '../ICoinDelegateProtocol'
import { CurrencyUnit, FeeDefaults } from '../ICoinProtocol'
import { ICoinSubProtocol } from '../ICoinSubProtocol'
import { NonExtendedProtocol } from '../NonExtendedProtocol'

import { SubstrateAccountId, SubstrateAddress } from './helpers/data/account/SubstrateAddress'
import { SubstratePayee } from './helpers/data/staking/SubstratePayee'
import { SubstrateStakingActionType } from './helpers/data/staking/SubstrateStakingActionType'
import { SubstrateTransaction, SubstrateTransactionType } from './helpers/data/transaction/SubstrateTransaction'
import { SubstrateTransactionConfig } from './helpers/SubstrateTransactionController'
import { SubstrateCryptoClient } from './SubstrateCryptoClient'
import { SubstrateProtocolOptions } from './SubstrateProtocolOptions'
import { SubstrateTransactionCursor, SubstrateTransactionResult } from './SubstrateTypes'

export abstract class SubstrateProtocol extends NonExtendedProtocol implements ICoinDelegateProtocol {
  public abstract symbol: string
  public abstract name: string
  public abstract marketSymbol: string
  public abstract feeSymbol: string

  public abstract decimals: number
  public abstract feeDecimals: number
  public abstract identifier: ProtocolSymbols

  public abstract feeDefaults: FeeDefaults
  public abstract units: CurrencyUnit[]
  public abstract standardDerivationPath: string

  public supportsHD: boolean = false

  public addressIsCaseSensitive: boolean = false

  public addressValidationPattern: string = '^5[a-km-zA-HJ-NP-Z1-9]+$'
  public addressPlaceholder: string = `5ABC...`

  protected defaultValidator?: string

  public readonly cryptoClient: SubstrateCryptoClient = new SubstrateCryptoClient()

  constructor(public readonly options: SubstrateProtocolOptions) {
    super()
  }

  public async getBlockExplorerLinkForAddress(address: string): Promise<string> {
    return this.options.network.blockExplorer.getAddressLink(address)
  }

  public async getBlockExplorerLinkForTxId(txId: string): Promise<string> {
    return this.options.network.blockExplorer.getTransactionLink(txId)
  }

  public async getPublicKeyFromMnemonic(mnemonic: string, derivationPath: string, password?: string): Promise<string> {
    const keyPair = await this.options.accountController.createKeyPairFromMnemonic(mnemonic, derivationPath, password)

    return keyPair.publicKey.toString('hex')
  }

  public async getPrivateKeyFromMnemonic(mnemonic: string, derivationPath: string, password?: string): Promise<Buffer> {
    const keyPair = await this.options.accountController.createKeyPairFromMnemonic(mnemonic, derivationPath, password)

    return keyPair.privateKey
  }

  public async getPublicKeyFromHexSecret(secret: string, derivationPath: string): Promise<string> {
    const keyPair = await this.options.accountController.createKeyPairFromHexSecret(secret, derivationPath)

    return keyPair.publicKey.toString('hex')
  }

  public async getPrivateKeyFromHexSecret(secret: string, derivationPath: string): Promise<Buffer> {
    const keyPair = await this.options.accountController.createKeyPairFromHexSecret(secret, derivationPath)

    return keyPair.privateKey
  }

  public async getAddressFromPublicKey(publicKey: string): Promise<SubstrateAddress> {
    return this.options.accountController.createAddressFromPublicKey(publicKey)
  }

  public async getAddressesFromPublicKey(publicKey: string): Promise<SubstrateAddress[]> {
    return [await this.getAddressFromPublicKey(publicKey)]
  }

  public async getNextAddressFromPublicKey(publicKey: string, current: SubstrateAddress): Promise<SubstrateAddress> {
    return current
  }

  public async getTransactionsFromPublicKey(
    publicKey: string,
    limit: number,
    cursor?: SubstrateTransactionCursor
  ): Promise<SubstrateTransactionResult> {
    const addresses = await this.getAddressesFromPublicKey(publicKey)
      .then((addresses: SubstrateAddress[]) => addresses.map((address: SubstrateAddress) => address.getValue()))

    return this.getTransactionsFromAddresses(addresses, limit, cursor)
  }

  public async getTransactionsFromAddresses(
    addresses: string[],
    limit: number,
    cursor?: SubstrateTransactionCursor
  ): Promise<SubstrateTransactionResult> {
    const txs: Partial<IAirGapTransaction[]>[] = await Promise.all(
      addresses.map((address) => this.options.blockExplorerClient.getTransactions(address, limit, this.decimals, cursor))
    )

    const transactions = txs
      .reduce((flatten, toFlatten) => flatten.concat(toFlatten), [])
      .map((tx) => ({
        protocolIdentifier: this.identifier,
        network: this.options.network,
        from: [],
        to: [],
        isInbound: false,
        amount: '',
        fee: '',
        ...tx
      }))

    return { transactions, cursor: { page: cursor ? cursor.page + 1 : 1 } }
  }

  public async signWithPrivateKey(privateKey: Buffer, rawTransaction: RawSubstrateTransaction): Promise<string> {
    const txs = this.options.transactionController.decodeDetails(rawTransaction.encoded)
    const signed = await Promise.all(
      txs.map((tx) => this.options.transactionController.signTransaction(privateKey, tx.transaction, tx.payload))
    )

    txs.forEach((tx, index) => (tx.transaction = signed[index]))

    return this.options.transactionController.encodeDetails(txs)
  }

  public async getTransactionDetails(transaction: UnsignedSubstrateTransaction): Promise<IAirGapTransaction[]> {
    return this.getTransactionDetailsFromEncoded(transaction.transaction.encoded)
  }

  public async getTransactionDetailsFromSigned(transaction: SignedSubstrateTransaction): Promise<IAirGapTransaction[]> {
    return this.getTransactionDetailsFromEncoded(transaction.transaction)
  }

  public async getBalanceOfAddresses(addresses: string[]): Promise<string> {
    const balances = await Promise.all(addresses.map((address) => this.options.accountController.getBalance(address)))
    const balance = balances.reduce((current: BigNumber, next: BigNumber) => current.plus(next))

    return balance.toString(10)
  }

  public async getAvailableBalanceOfAddresses(addresses: string[]): Promise<string> {
    const balances = await Promise.all(addresses.map((address) => this.options.accountController.getTransferableBalance(address, false)))
    const balance = balances.reduce((current: BigNumber, next: BigNumber) => current.plus(next))

    return balance.toString(10)
  }

  public async getBalanceOfPublicKey(publicKey: string): Promise<string> {
    const address = await this.getAddressFromPublicKey(publicKey)

    return this.getBalanceOfAddresses([address.getValue()])
  }

  public async getBalanceOfPublicKeyForSubProtocols(publicKey: string, subProtocols: ICoinSubProtocol[]): Promise<string[]> {
    throw Promise.reject('get balance of sub protocols not supported')
  }

  public async estimateMaxTransactionValueFromPublicKey(publicKey: string, recipients: string[], fee?: string): Promise<string> {
    const results = await Promise.all([
      this.options.accountController.getTransferableBalance(publicKey),
      this.getFutureRequiredTransactions(publicKey, 'check')
    ])

    const transferableBalance = results[0]
    const futureTransactions = results[1]

    const feeEstimate = await this.options.transactionController.estimateTransactionFees(publicKey, futureTransactions)

    if (!feeEstimate) {
      return Promise.reject('Could not estimate max value.')
    }

    let maxAmount = transferableBalance.minus(feeEstimate).minus(new BigNumber(fee || 0))

    if (maxAmount.lt(0)) {
      maxAmount = new BigNumber(0)
    }

    return maxAmount.toFixed()
  }

  public async estimateFeeDefaultsFromPublicKey(
    publicKey: string,
    recipients: string[],
    values: string[],
    data?: any
  ): Promise<FeeDefaults> {
    const destination = recipients[0]
    const value = values[0]

    const transaction = await this.options.transactionController.createTransaction(SubstrateTransactionType.TRANSFER, publicKey, 0, {
      to: destination && destination.length > 0 ? destination : publicKey,
      value: new BigNumber(value)
    })
    const fee = await this.options.transactionController.calculateTransactionFee(transaction)

    if (!fee) {
      return Promise.reject('Could not fetch all necessary data.')
    }

    return {
      low: fee.shiftedBy(-this.decimals).toFixed(),
      medium: fee.shiftedBy(-this.decimals).toFixed(),
      high: fee.shiftedBy(-this.decimals).toFixed()
    }
  }

  public async prepareTransactionFromPublicKey(
    publicKey: string,
    recipients: string[],
    values: string[],
    fee: string,
    data?: any
  ): Promise<RawSubstrateTransaction> {
    if (recipients.length !== values.length) {
      return Promise.reject("Recipients length doesn't match values length.")
    }

    const recipientsWithValues: [string, string][] = recipients.map((recipient, index) => [recipient, values[index]])

    const transferableBalance = await this.options.accountController.getTransferableBalance(publicKey)
    const totalValue = values.map((value) => new BigNumber(value)).reduce((total, next) => total.plus(next), new BigNumber(0))

    const available = new BigNumber(transferableBalance).minus(totalValue)

    const encoded = await this.options.transactionController.prepareSubmittableTransactions(
      publicKey,
      available,
      recipientsWithValues.map(([recipient, value]) => ({
        type: SubstrateTransactionType.TRANSFER,
        tip: 0, // temporary, until we handle Substrate fee/tip model
        args: {
          to: recipient,
          value: new BigNumber(value)
        }
      }))
    )

    return { encoded }
  }

  public async broadcastTransaction(encoded: string): Promise<string> {
    const txs: [number | undefined, SubstrateTransaction][] = this.options.transactionController
      .decodeDetails(encoded)
      .map((tx) => [tx.runtimeVersion, tx.transaction])

    try {
      const txHashes = await Promise.all(
        txs.map((tx) =>
          this.options.nodeClient.submitTransaction(tx[1].encode({ network: this.options.network.extras.network, runtimeVersion: tx[0] }))
        )
      )

      return txs[0][1]?.type !== SubstrateTransactionType.SUBMIT_BATCH ? txHashes[0] : ''
    } catch (error) {
      const axiosError = error as AxiosError
      throw new NetworkError(
        Domain.SUBSTRATE,
        axiosError.response && axiosError.response.data ? axiosError.response.data : `broadcastTransaction() failed with ${error}`
      )
    }
  }

  public async getDefaultDelegatee(): Promise<string> {
    if (this.defaultValidator) {
      return this.defaultValidator
    }

    const validators = await this.options.nodeClient.getValidators()

    return validators ? validators[0].getValue() : ''
  }

  public async getCurrentDelegateesForPublicKey(publicKey: string): Promise<string[]> {
    return this.options.accountController.getCurrentValidators(publicKey)
  }

  public async getCurrentDelegateesForAddress(address: string): Promise<string[]> {
    return this.options.accountController.getCurrentValidators(address)
  }

  public async getDelegateeDetails(address: string): Promise<DelegateeDetails> {
    const validatorDetails = await this.options.accountController.getValidatorDetails(address)

    return {
      name: validatorDetails.name || '',
      status: validatorDetails.status || '',
      address
    }
  }

  public async isPublicKeyDelegating(publicKey: string): Promise<boolean> {
    return this.options.accountController.isNominating(publicKey)
  }

  public async isAddressDelegating(address: string): Promise<boolean> {
    return this.options.accountController.isNominating(address)
  }

  public async getDelegatorDetailsFromPublicKey(publicKey: string): Promise<DelegatorDetails> {
    const address = await this.getAddressFromPublicKey(publicKey)

    return this.getDelegatorDetailsFromAddress(address.getValue())
  }

  public async getDelegatorDetailsFromAddress(address: string): Promise<DelegatorDetails> {
    return this.options.accountController.getNominatorDetails(address)
  }

  public async getDelegationDetailsFromPublicKey(publicKey: string, delegatees: string[]): Promise<DelegationDetails> {
    const address = await this.getAddressFromPublicKey(publicKey)

    return this.getDelegationDetailsFromAddress(address.getValue(), delegatees)
  }

  public async getDelegationDetailsFromAddress(address: string, delegatees: string[]): Promise<DelegationDetails> {
    const [nominatorDetails, validatorsDetails] = await Promise.all([
      this.options.accountController.getNominatorDetails(address, delegatees),
      Promise.all(delegatees.map((validator) => this.options.accountController.getValidatorDetails(validator)))
    ])

    nominatorDetails.rewards =
      nominatorDetails.delegatees.length > 0 && nominatorDetails.stakingDetails
        ? nominatorDetails.stakingDetails.rewards.map((reward) => ({
            index: reward.eraIndex,
            amount: reward.amount,
            timestamp: reward.timestamp
          }))
        : []

    return {
      delegator: nominatorDetails,
      delegatees: validatorsDetails
    }
  }

  // tslint:disable-next-line: cyclomatic-complexity
  public async prepareDelegatorActionFromPublicKey(
    publicKey: string,
    type: SubstrateStakingActionType,
    data?: any
  ): Promise<RawSubstrateTransaction[]> {
    if (!data) {
      data = {}
    }

    switch (type) {
      case SubstrateStakingActionType.BOND_NOMINATE:
        assertFields(`${SubstrateStakingActionType[type]} action`, data, 'targets', 'value', 'payee')

        return this.prepareDelegation(publicKey, data.tip || 0, data.targets, data.controller || publicKey, data.value, data.payee)
      case SubstrateStakingActionType.REBOND_NOMINATE:
        assertFields(`${SubstrateStakingActionType[type]} action`, data, 'targets', 'value')

        return this.prepareRebondNominate(publicKey, data.tip || 0, data.targets, data.value)
      case SubstrateStakingActionType.NOMINATE:
        assertFields(`${SubstrateStakingActionType[type]} action`, data, 'targets')

        return this.prepareDelegation(publicKey, data.tip || 0, data.targets)
      case SubstrateStakingActionType.CANCEL_NOMINATION:
        return this.prepareCancelDelegation(publicKey, data.tip || 0, data.value)
      case SubstrateStakingActionType.CHANGE_NOMINATION:
        assertFields(`${SubstrateStakingActionType[type]} action`, data, 'targets')

        return this.prepareChangeValidator(publicKey, data.tip || 0, data.targets)
      case SubstrateStakingActionType.UNBOND:
        assertFields(`${SubstrateStakingActionType[type]} action`, data, 'value')

        return this.prepareUnbond(publicKey, data.tip || 0, data.value)
      case SubstrateStakingActionType.REBOND:
        assertFields(`${SubstrateStakingActionType[type]} action`, data, 'value')

        return this.prepareRebond(publicKey, data.tip || 0, data.value)
      case SubstrateStakingActionType.BOND_EXTRA:
        assertFields(`${SubstrateStakingActionType[type]} action`, data, 'value')

        return this.prepareBondExtra(publicKey, data.tip || 0, data.value)
      case SubstrateStakingActionType.REBOND_EXTRA:
        assertFields(`${SubstrateStakingActionType[type]} action`, data, 'value')

        return this.prepareRebondExtra(publicKey, data.tip || 0, data.value)
      case SubstrateStakingActionType.WITHDRAW_UNBONDED:
        return this.prepareWithdrawUnbonded(publicKey, data.tip || 0)
      case SubstrateStakingActionType.CHANGE_REWARD_DESTINATION:
        return Promise.reject('Unsupported delegator action.')
      case SubstrateStakingActionType.CHANGE_CONTROLLER:
        return Promise.reject('Unsupported delegator action.')
      default:
        return Promise.reject('Unsupported delegator action.')
    }
  }

  public async prepareDelegation(
    publicKey: string,
    tip: string | number | BigNumber,
    targets: string[] | string,
    controller?: string,
    value?: string | number | BigNumber,
    payee?: string | SubstratePayee
  ): Promise<RawSubstrateTransaction[]> {
    const transferableBalance = await this.options.accountController.getTransferableBalance(publicKey, false, false)
    const available = new BigNumber(transferableBalance).minus(value || 0)

    const bondFirst = controller !== undefined && value !== undefined && payee !== undefined

    const encoded = await this.options.transactionController.prepareSubmittableTransactions(publicKey, available, [
      ...(bondFirst
        ? [
            {
              type: SubstrateTransactionType.BOND,
              tip,
              args: {
                controller,
                value: BigNumber.isBigNumber(value) ? value : new BigNumber(value!),
                payee: typeof payee === 'string' ? SubstratePayee[payee] : payee
              }
            }
          ]
        : []),
      {
        type: SubstrateTransactionType.NOMINATE,
        tip,
        args: {
          targets: typeof targets === 'string' ? [targets] : targets
        }
      }
    ])

    return [{ encoded }]
  }

  public async prepareRebondNominate(
    publicKey: string,
    tip: string | number | BigNumber,
    targets: string[] | string,
    value: string | number | BigNumber
  ): Promise<RawSubstrateTransaction[]> {
    const [transferableBalance, lockedBalance] = await Promise.all([
      this.options.accountController.getTransferableBalance(publicKey, false, false),
      this.options.accountController.getUnlockingBalance(publicKey)
    ])

    const toDelegate = BigNumber.isBigNumber(value) ? value : new BigNumber(value)

    const configs: SubstrateTransactionConfig[] = []
    if (toDelegate.gt(lockedBalance)) {
      configs.push(
        {
          type: SubstrateTransactionType.REBOND,
          tip,
          args: {
            value: lockedBalance
          }
        },
        {
          type: SubstrateTransactionType.BOND_EXTRA,
          tip,
          args: {
            value: toDelegate.minus(lockedBalance)
          }
        }
      )
    } else {
      configs.push({
        type: SubstrateTransactionType.REBOND,
        tip,
        args: {
          value: toDelegate
        }
      })
    }
    configs.push({
      type: SubstrateTransactionType.NOMINATE,
      tip,
      args: {
        targets: typeof targets === 'string' ? [targets] : targets
      }
    })

    const encoded = await this.options.transactionController.prepareSubmittableTransactions(publicKey, transferableBalance, configs)

    return [{ encoded }]
  }

  public async prepareCancelDelegation(
    publicKey: string,
    tip: string | number | BigNumber,
    value?: string | number | BigNumber
  ): Promise<RawSubstrateTransaction[]> {
    const transferableBalance = await this.options.accountController.getTransferableBalance(publicKey, false, false)
    const keepController = value === undefined

    const encoded = await this.options.transactionController.prepareSubmittableTransactions(publicKey, transferableBalance, [
      {
        type: SubstrateTransactionType.CANCEL_NOMINATION,
        tip,
        args: {}
      },
      ...(keepController
        ? []
        : [
            {
              type: SubstrateTransactionType.UNBOND,
              tip,
              args: {
                value: BigNumber.isBigNumber(value) ? value : new BigNumber(value!)
              }
            }
          ])
    ])

    return [{ encoded }]
  }

  public async prepareChangeValidator(
    publicKey: string,
    tip: string | number | BigNumber,
    targets: string[] | string
  ): Promise<RawSubstrateTransaction[]> {
    const transferableBalance = await this.options.accountController.getTransferableBalance(publicKey, false, false)

    const encoded = await this.options.transactionController.prepareSubmittableTransactions(publicKey, transferableBalance, [
      {
        type: SubstrateTransactionType.NOMINATE,
        tip,
        args: {
          targets: typeof targets === 'string' ? [targets] : targets
        }
      }
    ])

    return [{ encoded }]
  }

  public async prepareUnbond(
    publicKey: string,
    tip: string | number | BigNumber,
    value: string | number | BigNumber
  ): Promise<RawSubstrateTransaction[]> {
    const transferableBalance = await this.options.accountController.getTransferableBalance(publicKey, false, false)

    const encoded = await this.options.transactionController.prepareSubmittableTransactions(publicKey, transferableBalance, [
      {
        type: SubstrateTransactionType.UNBOND,
        tip,
        args: {
          value: BigNumber.isBigNumber(value) ? value : new BigNumber(value)
        }
      }
    ])

    return [{ encoded }]
  }

  public async prepareRebond(
    publicKey: string,
    tip: string | number | BigNumber,
    value: string | number | BigNumber
  ): Promise<RawSubstrateTransaction[]> {
    const transferableBalance = await this.options.accountController.getTransferableBalance(publicKey, false, false)

    const encoded = await this.options.transactionController.prepareSubmittableTransactions(publicKey, transferableBalance, [
      {
        type: SubstrateTransactionType.REBOND,
        tip,
        args: {
          value: BigNumber.isBigNumber(value) ? value : new BigNumber(value)
        }
      }
    ])

    return [{ encoded }]
  }

  public async prepareBondExtra(
    publicKey: string,
    tip: string | number | BigNumber,
    value: string | number | BigNumber
  ): Promise<RawSubstrateTransaction[]> {
    const transferableBalance = await this.options.accountController.getTransferableBalance(publicKey, false, false)

    const encoded = await this.options.transactionController.prepareSubmittableTransactions(publicKey, transferableBalance, [
      {
        type: SubstrateTransactionType.BOND_EXTRA,
        tip,
        args: {
          value: BigNumber.isBigNumber(value) ? value : new BigNumber(value)
        }
      }
    ])

    return [{ encoded }]
  }

  public async prepareRebondExtra(
    publicKey: string,
    tip: string | number | BigNumber,
    value: string | number | BigNumber
  ): Promise<RawSubstrateTransaction[]> {
    const [transferableBalance, lockedBalance] = await Promise.all([
      this.options.accountController.getTransferableBalance(publicKey, false, false),
      this.options.accountController.getUnlockingBalance(publicKey)
    ])

    const toDelegate = BigNumber.isBigNumber(value) ? value : new BigNumber(value)

    const configs: SubstrateTransactionConfig[] = toDelegate.gt(lockedBalance)
      ? [
          {
            type: SubstrateTransactionType.REBOND,
            tip,
            args: {
              value: lockedBalance
            }
          },
          {
            type: SubstrateTransactionType.BOND_EXTRA,
            tip,
            args: {
              value: toDelegate.minus(lockedBalance)
            }
          }
        ]
      : [
          {
            type: SubstrateTransactionType.REBOND,
            tip,
            args: {
              value: toDelegate
            }
          }
        ]

    const encoded = await this.options.transactionController.prepareSubmittableTransactions(publicKey, transferableBalance, configs)

    return [{ encoded }]
  }

  public async prepareWithdrawUnbonded(publicKey: string, tip: string | number | BigNumber): Promise<RawSubstrateTransaction[]> {
    const [transferableBalance, slashingSpansNumber] = await Promise.all([
      this.options.accountController.getTransferableBalance(publicKey, false, false),
      this.options.accountController.getSlashingSpansNumber(publicKey)
    ])

    const encoded = await this.options.transactionController.prepareSubmittableTransactions(publicKey, transferableBalance, [
      {
        type: SubstrateTransactionType.WITHDRAW_UNBONDED,
        tip,
        args: { slashingSpansNumber }
      }
    ])

    return [{ encoded }]
  }

  public async estimateMaxDelegationValueFromAddress(address: string): Promise<string> {
    const results = await Promise.all([
      this.options.accountController.getTransferableBalance(address, false, false),
      this.getFutureRequiredTransactions(address, 'delegate')
    ])

    const transferableBalance = results[0]
    const futureTransactions = results[1]

    const feeEstimate = await this.options.transactionController.estimateTransactionFees(address, futureTransactions)

    if (!feeEstimate) {
      return Promise.reject('Could not estimate max value.')
    }

    const maxValue = transferableBalance.minus(feeEstimate)

    return (maxValue.gte(0) ? maxValue : new BigNumber(0)).toString(10)
  }

  public async getFutureRequiredTransactions(
    accountId: SubstrateAccountId,
    intention: 'check' | 'transfer' | 'delegate'
  ): Promise<[SubstrateTransactionType, any][]> {
    const results = await Promise.all([
      this.options.accountController.isBonded(accountId),
      this.options.accountController.isNominating(accountId),
      this.options.accountController.getTransferableBalance(accountId),
      this.options.accountController.getTransferableBalance(accountId, false, false),
      this.options.accountController.getUnlockingBalance(accountId)
    ])

    const isBonded = results[0]
    const isNominating = results[1]
    const transferableBalance = results[2]
    const stakingBalance = results[3]
    const unlockingBalance = results[4]

    const isUnbonding = unlockingBalance.gt(0)

    const requiredTransactions: [SubstrateTransactionType, any][] = []

    if (intention === 'transfer') {
      requiredTransactions.push([
        SubstrateTransactionType.TRANSFER,
        {
          to: SubstrateAddress.createPlaceholder(),
          value: transferableBalance
        }
      ])
    }
    if (!isBonded && !isUnbonding && intention === 'delegate') {
      // not delegated & unbond
      requiredTransactions.push(
        [
          SubstrateTransactionType.BOND,
          {
            controller: SubstrateAddress.createPlaceholder(),
            value: stakingBalance,
            payee: 0
          }
        ],
        [
          SubstrateTransactionType.NOMINATE,
          {
            targets: [SubstrateAddress.createPlaceholder()]
          }
        ],
        [SubstrateTransactionType.CANCEL_NOMINATION, {}],
        [
          SubstrateTransactionType.UNBOND,
          {
            value: stakingBalance
          }
        ],
        [
          SubstrateTransactionType.WITHDRAW_UNBONDED,
          {
            slashingSpansNumber: 0
          }
        ]
      )
    } else if (isUnbonding && intention === 'delegate') {
      requiredTransactions.push(
        [
          SubstrateTransactionType.REBOND,
          {
            value: unlockingBalance
          }
        ],
        [
          SubstrateTransactionType.NOMINATE,
          {
            targets: [SubstrateAddress.createPlaceholder()]
          }
        ],
        [SubstrateTransactionType.CANCEL_NOMINATION, {}],
        [
          SubstrateTransactionType.UNBOND,
          {
            value: stakingBalance.plus(unlockingBalance)
          }
        ],
        [
          SubstrateTransactionType.WITHDRAW_UNBONDED,
          {
            slashingSpansNumber: 0
          }
        ]
      )
    } else if (isBonded) {
      requiredTransactions.push(
        [
          SubstrateTransactionType.UNBOND,
          {
            value: stakingBalance
          }
        ],
        [
          SubstrateTransactionType.WITHDRAW_UNBONDED,
          {
            slashingSpansNumber: 0
          }
        ]
      )
    }

    if (isNominating) {
      requiredTransactions.push([SubstrateTransactionType.CANCEL_NOMINATION, {}])
    }

    return requiredTransactions
  }

  private async getTransactionDetailsFromEncoded(encoded: string): Promise<IAirGapTransaction[]> {
    const txs = this.options.transactionController.decodeDetails(encoded)

    return txs
      .map((tx) => {
        return tx.transaction.toAirGapTransactions().map((part) => ({
          from: [],
          to: [],
          amount: '',
          fee: tx.fee.toString(),
          protocolIdentifier: this.identifier,
          network: this.options.network,
          isInbound: false,
          ...part
        }))
      })
      .reduce((flatten, toFlatten) => flatten.concat(toFlatten), [])
  }

  public async signMessage(message: string, keypair: { publicKey: string; privateKey: Buffer }): Promise<string> {
    return this.cryptoClient.signMessage(message, keypair)
  }

  public async verifyMessage(message: string, signature: string, publicKey: string): Promise<boolean> {
    return this.cryptoClient.verifyMessage(message, signature, publicKey)
  }

  public async encryptAsymmetric(message: string, publicKey: string): Promise<string> {
    return this.cryptoClient.encryptAsymmetric(message, publicKey)
  }

  public async decryptAsymmetric(message: string, keypair: { publicKey: string; privateKey: Buffer }): Promise<string> {
    return this.cryptoClient.decryptAsymmetric(message, keypair)
  }

  public async encryptAES(message: string, privateKey: Buffer): Promise<string> {
    // https://github.com/w3f/schnorrkel/blob/master/src/keys.rs
    // https://github.com/polkadot-js/wasm/blob/master/packages/wasm-crypto/src/sr25519.rs
    const key: Buffer = privateKey.slice(0, 32) // Substrate key is 32 bytes key + 32 bytes nonce

    return this.cryptoClient.encryptAES(message, key)
  }

  public async decryptAES(message: string, privateKey: Buffer): Promise<string> {
    // https://github.com/w3f/schnorrkel/blob/master/src/keys.rs
    // https://github.com/polkadot-js/wasm/blob/master/packages/wasm-crypto/src/sr25519.rs
    const key: Buffer = privateKey.slice(0, 32) // Substrate key is 32 bytes key + 32 bytes nonce

    return this.cryptoClient.decryptAES(message, key)
  }

  public async getTransactionStatuses(transactionHashes: string[]): Promise<AirGapTransactionStatus[]> {
    return Promise.reject('Transaction status not implemented')
  }
}

import { bip39ToMiniSecret, waitReady } from '@polkadot/wasm-crypto'

import { KeyPair } from '../../../data/KeyPair'
import BigNumber from '../../../dependencies/src/bignumber.js-9.0.0/bignumber'
import { createSr25519KeyPair } from '../../../utils/sr25519'
import { DelegatorAction } from '../../ICoinDelegateProtocol'
import { SubstrateNetwork } from '../SubstrateNetwork'

import { SubstrateAccountId, SubstrateAddress } from './data/account/SubstrateAddress'
import { SubstrateIdentityInfo } from './data/account/SubstrateRegistration'
import { SCALEAccountId } from './data/scale/type/SCALEAccountId'
import { SubstrateActiveEraInfo } from './data/staking/SubstrateActiveEraInfo'
import { SubstrateElectionStatus } from './data/staking/SubstrateEraElectionStatus'
import { SubstrateExposure } from './data/staking/SubstrateExposure'
import { SubstrateNominations } from './data/staking/SubstrateNominations'
import { SubstrateNominationStatus } from './data/staking/SubstrateNominationStatus'
import {
  SubstrateLockedDetails,
  SubstrateNominatorDetails,
  SubstrateNominatorRewardDetails,
  SubstrateStakingDetails,
  SubstrateStakingStatus
} from './data/staking/SubstrateNominatorDetails'
import { SubstrateStakingActionType } from './data/staking/SubstrateStakingActionType'
import { SubstrateStakingLedger } from './data/staking/SubstrateStakingLedger'
import {
  SubstrateValidatorDetails,
  SubstrateValidatorRewardDetails,
  SubstrateValidatorStatus
} from './data/staking/SubstrateValidatorDetails'
import { SubstrateValidatorPrefs } from './data/staking/SubstrateValidatorPrefs'
import { SubstrateNodeClient } from './node/SubstrateNodeClient'

export class SubstrateAccountController {
  constructor(readonly network: SubstrateNetwork, readonly nodeClient: SubstrateNodeClient) {}

  public async createKeyPairFromMnemonic(mnemonic: string, derivationPath: string, password?: string): Promise<KeyPair> {
    await waitReady()
    const secret = bip39ToMiniSecret(mnemonic, password || '')

    return this.createKeyPairFromHexSecret(Buffer.from(secret).toString('hex'), derivationPath)
  }

  public async createKeyPairFromHexSecret(secret: string, derivationPath: string): Promise<KeyPair> {
    return createSr25519KeyPair(secret, derivationPath)
  }

  public async createAddressFromPublicKey(publicKey: string): Promise<SubstrateAddress> {
    return SubstrateAddress.from(publicKey, this.network)
  }

  public async getBalance(accountId: SubstrateAccountId): Promise<BigNumber> {
    const accountInfo = await this.nodeClient.getAccountInfo(SubstrateAddress.from(accountId, this.network))

    return accountInfo?.data.free.value ?? new BigNumber(0)
  }

  public async getTransferableBalance(
    accountId: SubstrateAccountId, 
    excludeExistentialDeposit: boolean = true,
    ignoreFees: boolean = true,
  ): Promise<BigNumber> {
    const results = await Promise.all([
      this.nodeClient.getAccountInfo(SubstrateAddress.from(accountId, this.network)),
      excludeExistentialDeposit ? this.nodeClient.getExistentialDeposit() : null
    ])

    const accountInfo = results[0]
    const minBalance = results[1]

    if (!accountInfo) {
      return new BigNumber(0)
    }

    const free = accountInfo.data.free.value
    const reserved = accountInfo.data.reserved.value
    const locked = ignoreFees ? accountInfo.data.miscFrozen.value : accountInfo.data.feeFrozen.value

    return free
      .minus(reserved)
      .minus(locked)
      .minus(minBalance || 0)
  }

  public async getUnlockingBalance(accountId: SubstrateAccountId): Promise<BigNumber> {
    const stakingDetails = await this.nodeClient.getStakingLedger(SubstrateAddress.from(accountId, this.network))

    return stakingDetails?.unlocking.elements.map(entry => entry.first.value).reduce((sum, next) => sum.plus(next), new BigNumber(0)) ?? new BigNumber(0)
  }

  public async isBonded(accountId: SubstrateAccountId): Promise<boolean> {
    const bonded = await this.nodeClient.getBonded(SubstrateAddress.from(accountId, this.network))

    return bonded != null
  }

  public async isNominating(accountId: SubstrateAccountId): Promise<boolean> {
    const nominations = await this.nodeClient.getNominations(SubstrateAddress.from(accountId, this.network))

    return nominations != null
  }

  public async getCurrentValidators(accountId: SubstrateAccountId): Promise<string[]> {
    const nominations = await this.nodeClient.getNominations(SubstrateAddress.from(accountId, this.network))
    if (nominations) {
      return nominations.targets.elements.map((target) => target.asAddress())
    }

    return []
  }

  public async getValidatorDetails(accountId: SubstrateAccountId): Promise<SubstrateValidatorDetails> {
    const address = SubstrateAddress.from(accountId, this.network)
    const activeEra = await this.nodeClient.getActiveEraInfo()

    let identity: SubstrateIdentityInfo | undefined
    let status: SubstrateValidatorStatus | undefined
    let exposure: SubstrateExposure | undefined
    let validatorPrefs: SubstrateValidatorPrefs | undefined
    let lastEraReward: SubstrateValidatorRewardDetails | undefined
    if (activeEra) {
      const activeEraIndex = activeEra.index.toNumber()
      const results = await Promise.all([
        this.getAccountIdentityInfo(address),
        this.nodeClient.getValidators(),
        this.nodeClient.getValidatorPrefs(activeEraIndex, address),
        this.nodeClient.getValidatorExposure(activeEraIndex, address)
      ])

      identity = results[0] || undefined
      const currentValidators = results[1]
      validatorPrefs = results[2] || undefined
      exposure = results[3] || undefined

      lastEraReward = (await this.getEraValidatorReward(address, activeEraIndex - 1)) || undefined

      if (currentValidators && currentValidators.find((current) => current.compare(address) == 0)) {
        status = 'Active'
      } else if (currentValidators) {
        status = 'Inactive'
      }
    }

    return {
      address: address.getValue(),
      name: identity ? identity.display.toString() : undefined,
      status: status || undefined,
      ownStash: exposure ? exposure.own.toString() : undefined,
      totalStakingBalance: exposure ? exposure.total.toString() : undefined,
      commission: validatorPrefs
        ? validatorPrefs.commission.value.dividedBy(1_000_000_000).toString() // commission is Perbill (parts per billion)
        : undefined,
      lastEraReward,
      nominators: exposure?.others.elements.length ?? 0
    }
  }

  public async getNominatorDetails(accountId: SubstrateAccountId, validatorIds?: SubstrateAccountId[]): Promise<SubstrateNominatorDetails> {
    const address = SubstrateAddress.from(accountId, this.network)

    const results = await Promise.all([
      this.getBalance(address),
      this.getTransferableBalance(address, false),
      this.nodeClient.getStakingLedger(address),
      this.nodeClient.getNominations(address),
      this.nodeClient.getActiveEraInfo(),
      this.nodeClient.getExpectedEraDuration(),
      this.nodeClient.getExistentialDeposit()
    ])

    const balance = results[0]
    const transferableBalance = results[1]
    const stakingLedger = results[2]
    const nominations = results[3]
    const activeEra = results[4]
    const expectedEraDuration = results[5]

    if (!balance || !transferableBalance || !activeEra || !expectedEraDuration) {
      return Promise.reject('Could not fetch nominator details.')
    }

    const validators = nominations?.targets?.elements?.map((target) => target.asAddress()) || []

    const stakingDetails = await this.getStakingDetails(accountId, stakingLedger, nominations, activeEra, expectedEraDuration)
    const availableActions = await this.getAvailableStakingActions(
      stakingDetails,
      nominations,
      validatorIds || validators,
      transferableBalance
    )

    return {
      address: address.getValue(),
      balance: balance.toString(),
      delegatees: validators,
      availableActions,
      stakingDetails: stakingDetails || undefined
    }
  }

  public async getNominationStatus(
    nominator: SubstrateAccountId, 
    validator: SubstrateAccountId, 
    era?: number
  ): Promise<SubstrateNominationStatus | undefined> {
    const eraIndex: number | undefined = era !== undefined
      ? era
      : (await this.nodeClient.getActiveEraInfo())?.index.toNumber()
    
    if (eraIndex === undefined) {
      return Promise.reject('Could not fetch active era')
    }

    const nominations = await this.nodeClient.getNominations(SubstrateAddress.from(nominator, this.network))
    if (nominations === null || !nominations.targets.elements.some((target: SCALEAccountId) => target.asAddress() === validator)) {
      return undefined
    }

    const exposure: SubstrateExposure | null = await this.nodeClient.getValidatorExposure(
      eraIndex, 
      SubstrateAddress.from(validator, this.network)
    )

    if (!exposure) {
      return SubstrateNominationStatus.INACTIVE
    }

    const isActive: boolean = exposure.others.elements.some((element) => element.first.asAddress() === nominator.toString())
    if (!isActive) {
      return SubstrateNominationStatus.INACTIVE
    }
    
    const isOversubscribed: boolean = exposure.others.elements.length > 256
    if (isOversubscribed) {
      const position: number = exposure.others.elements
        .sort((a, b) => b.second.value.minus(a.second.value).toNumber())
        .map((exposure) => exposure.first.asAddress())
        .indexOf(nominator.toString())

      if (position > 256) {
        return SubstrateNominationStatus.OVERSUBSCRIBED
      }
    }

    return SubstrateNominationStatus.ACTIVE
  }

  public async getSlashingSpansNumber(accountId: SubstrateAccountId): Promise<number> {
    const slashingSpans = await this.nodeClient.getSlashingSpan(SubstrateAddress.from(accountId, this.network))

    return slashingSpans ? slashingSpans.prior.elements.length + 1 : 0
  }

  private async getStakingDetails(
    accountId: SubstrateAccountId,
    stakingLedger: SubstrateStakingLedger | null,
    nominations: SubstrateNominations | null,
    activeEra: SubstrateActiveEraInfo,
    expectedEraDuration: BigNumber
  ): Promise<SubstrateStakingDetails | null> {
    if (!stakingLedger) {
      return null
    }

    const unlockingDetails = this.getUnlockingDetails(
      stakingLedger.unlocking.elements.map((tuple) => [tuple.first.value, tuple.second.value] as [BigNumber, BigNumber]),
      activeEra,
      expectedEraDuration
    )
    
    const results = await Promise.all([
      this.getStakingStatus(accountId, nominations, activeEra.index.toNumber()),
      nominations ? this.getNominatorRewards(accountId, nominations.targets.elements.map((id) => id.address), activeEra, 5) : []
    ])

    const stakingStatus = results[0]
    const rewards = results[1]

    return {
      total: stakingLedger.total.toString(),
      active: stakingLedger.active.toString(),
      locked: unlockingDetails.locked,
      unlocked: unlockingDetails.unlocked,
      status: stakingStatus,
      nextEra: activeEra.start.value?.plus(expectedEraDuration)?.toNumber() || 0,
      rewards
    }
  }

  private getUnlockingDetails(
    unlocking: [BigNumber, BigNumber][],
    activeEra: SubstrateActiveEraInfo,
    expectedEraDuration: BigNumber
  ): { locked: SubstrateLockedDetails[]; unlocked: string } {
    const [locked, unlocked] = this.partitionArray(unlocking, ([_, era]) => activeEra.index.lt(era))

    const lockedDetails = locked.map(([value, era]: [BigNumber, BigNumber]) => {
      const eraStart = activeEra.start.value?.value || new BigNumber(0)
      const estimatedDuration = era.minus(activeEra.index.value).multipliedBy(expectedEraDuration)
      const expectedUnlock = eraStart.plus(estimatedDuration)

      return {
        value: value.toString(10),
        expectedUnlock: expectedUnlock.toNumber()
      }
    })

    const totalUnlocked = unlocked.reduce((total: BigNumber, [value, _]: [BigNumber, BigNumber]) => total.plus(value), new BigNumber(0))

    return {
      locked: lockedDetails,
      unlocked: totalUnlocked.toString()
    }
  }

  private async getStakingStatus(
    nominator: SubstrateAccountId, 
    nominations: SubstrateNominations | null, 
    eraIndex: number
  ): Promise<SubstrateStakingStatus> {
    const isWaitingForNomination: boolean = nominations?.submittedIn.gte(eraIndex) ?? false

    let hasActiveNominations: boolean = false
    if (!isWaitingForNomination && nominations) {
      hasActiveNominations = (await Promise.all(
        nominations.targets.elements.map((target: SCALEAccountId) => this.getNominationStatus(nominator, target.asAddress(), eraIndex))
      )).some((status: SubstrateNominationStatus | undefined) => status === SubstrateNominationStatus.ACTIVE)
    }
    
    if (nominations === null) {
      return 'bonded'
    } else if (hasActiveNominations) {
      return 'nominating'
    } else if (!isWaitingForNomination && !hasActiveNominations) {
      return 'nominating_inactive'
    } else {
      return 'nominating_waiting'
    }
  }

  private async getEraValidatorReward(accountId: SubstrateAccountId, eraIndex: number): Promise<SubstrateValidatorRewardDetails | null> {
    const address = SubstrateAddress.from(accountId, this.network)

    const results = await Promise.all([
      this.nodeClient.getValidatorReward(eraIndex).then(async (result) => {
        return result ? result : this.nodeClient.getValidatorReward(eraIndex - 1)
      }),
      this.nodeClient.getRewardPoints(eraIndex),
      this.nodeClient.getStakersClipped(eraIndex, address),
      this.nodeClient.getValidatorPrefs(eraIndex, address)
    ])

    if (results.some((result) => !result)) {
      return null
    }

    const eraReward = results[0]
    const eraPoints = results[1]
    const exposureClipped = results[2]
    const validatorPrefs = results[3]

    const validatorPoints = eraPoints?.individual?.elements?.find((element) => element.first.address.compare(address))?.second?.value

    if (!eraReward || !eraPoints || !exposureClipped || !validatorPrefs || !validatorPoints) {
      return null
    }

    const validatorReward = this.calculateValidatorReward(eraReward, eraPoints.total.value, validatorPoints)

    return {
      amount: validatorReward.toFixed(),
      totalStake: exposureClipped.total.toString(),
      ownStake: exposureClipped.own.toString(),
      commission: validatorPrefs.commission.toString()
    }
  }

  private async getNominatorRewards(
    accountId: SubstrateAccountId,
    validators: SubstrateAccountId[],
    activeEra: SubstrateActiveEraInfo,
    eras: number | number[]
  ): Promise<SubstrateNominatorRewardDetails[]> {
    const address = SubstrateAddress.from(accountId, this.network)
    const expectedEraDuration = await this.nodeClient.getExpectedEraDuration()

    if (!expectedEraDuration) {
      return Promise.reject('Could not fetch all necessary data.')
    }

    const eraIndices = Array.isArray(eras) ? eras : Array.from(Array(eras).keys()).map((index) => activeEra.index.toNumber() - 1 - index)

    const rewards = await Promise.all(
      eraIndices.map((era) =>
        this.calculateEraNominatorReward(
          address,
          validators.map((validator) => SubstrateAddress.from(validator, this.network)),
          era
        ).then((partial) => {
          if (partial) {
            const rewardEra = partial.eraIndex || activeEra.index.toNumber()
            const erasPassed = activeEra.index.minus(rewardEra).toNumber()

            partial.timestamp = activeEra.start.value
              ? activeEra.start.value.minus(expectedEraDuration.multipliedBy(erasPassed - 1)).toNumber()
              : 0
          }

          return partial as SubstrateNominatorRewardDetails
        })
      )
    )

    return rewards.filter((reward) => reward)
  }

  private async calculateEraNominatorReward(
    accountId: SubstrateAccountId,
    validators: SubstrateAccountId[],
    eraIndex: number
  ): Promise<Partial<SubstrateNominatorRewardDetails> | null> {
    const results = await Promise.all([
      this.nodeClient.getValidatorReward(eraIndex),
      this.nodeClient.getRewardPoints(eraIndex),
      Promise.all(
        validators.map(
          async (validator) =>
            [
              SubstrateAddress.from(validator, this.network),
              await this.nodeClient
                .getValidatorPrefs(eraIndex, SubstrateAddress.from(validator, this.network))
                .then((prefs) => prefs?.commission?.value),
              await this.nodeClient.getStakersClipped(eraIndex, SubstrateAddress.from(validator, this.network))
            ] as [SubstrateAddress, BigNumber | null, SubstrateExposure | null]
        )
      )
    ])

    const reward = results[0]
    const rewardPoints = results[1]
    const exposuresWithValidators = results[2]

    if (!reward || !rewardPoints || !exposuresWithValidators) {
      return null
    }

    const partialRewards = exposuresWithValidators
      .map(([validator, commission, exposure]) => {
        const validatorPoints = rewardPoints.individual.elements.find((element) => element.first.address.compare(validator) === 0)?.second
          ?.value

        const nominatorStake = exposure?.others.elements.find((element) => element.first.address.compare(accountId) === 0)?.second?.value

        if (commission && exposure && validatorPoints && nominatorStake) {
          const validatorReward = this.calculateValidatorReward(reward, rewardPoints.total.value, validatorPoints)

          return this.calculateNominatorReward(validatorReward, commission, exposure.total.value, nominatorStake)
        } else {
          return null
        }
      })
      .filter((reward) => reward !== null)

    if (partialRewards.every((reward) => !reward)) {
      return null
    }

    return {
      eraIndex,
      amount: partialRewards.reduce((sum: BigNumber, next) => sum.plus(next!), new BigNumber(0)).toFixed(0),
      exposures: exposuresWithValidators
        ?.map(([validator, _, exposure]) => [
          validator.getValue(),
          exposure?.others.elements.findIndex((element) => element.first.address.compare(accountId) === 0)
        ])
        .filter(([_, index]) => index !== undefined) as [string, number][]
    }
  }

  private calculateValidatorReward(totalReward: BigNumber, totalPoints: BigNumber, validatorPoints: BigNumber): BigNumber {
    return validatorPoints.dividedBy(totalPoints).multipliedBy(totalReward)
  }

  private calculateNominatorReward(
    validatorReward: BigNumber,
    validatorCommission: BigNumber,
    totalStake: BigNumber,
    nominatorStake: BigNumber
  ): BigNumber {
    const nominatorShare = nominatorStake.dividedBy(totalStake)

    return new BigNumber(1).minus(validatorCommission.dividedBy(1_000_000_000)).multipliedBy(validatorReward).multipliedBy(nominatorShare)
  }

  // tslint:disable-next-line: cyclomatic-complexity
  private async getAvailableStakingActions(
    stakingDetails: SubstrateStakingDetails | null,
    nominations: SubstrateNominations | null,
    validatorIds: SubstrateAccountId[],
    maxDelegationValue: BigNumber
  ): Promise<DelegatorAction[]> {
    const availableActions: DelegatorAction[] = []

    const currentValidators = nominations?.targets?.elements?.map((target) => target.asAddress()) || []
    const validatorAddresses = validatorIds.map((id) => SubstrateAddress.from(id, this.network).getValue())

    const isBonded = new BigNumber(stakingDetails?.active ?? 0).gt(0)
    const isDelegating = nominations !== null
    const isUnbonding = stakingDetails && stakingDetails.locked.length > 0

    const minBondingValue = await this.nodeClient.getExistentialDeposit()
    const minDelegationValue = new BigNumber(1)

    const electionStatus = await this.nodeClient.getElectionStatus().then((eraElectionStatus) => eraElectionStatus?.status.value)
    const isElectionClosed = electionStatus !== SubstrateElectionStatus.OPEN

    const hasFundsToWithdraw = new BigNumber(stakingDetails?.unlocked ?? 0).gt(0)

    if (maxDelegationValue.gt(minBondingValue) && !isBonded && !isUnbonding && isElectionClosed) {
      availableActions.push({
        type: SubstrateStakingActionType.BOND_NOMINATE,
        args: ['targets', 'controller', 'value', 'payee']
      })
    }

    if (maxDelegationValue.gt(minDelegationValue) && isBonded && !isUnbonding && isElectionClosed) {
      availableActions.push({
        type: SubstrateStakingActionType.BOND_EXTRA,
        args: ['value']
      })
    }

    if (isBonded && !isDelegating && !isUnbonding && isElectionClosed) {
      availableActions.push(
        {
          type: SubstrateStakingActionType.NOMINATE,
          args: ['targets']
        },
        {
          type: SubstrateStakingActionType.UNBOND,
          args: ['value']
        }
      )
    }

    if (isUnbonding && !isDelegating && isElectionClosed) {
      availableActions.push({
        type: SubstrateStakingActionType.REBOND_NOMINATE,
        args: ['targets', 'value']
      })
    }

    if (isUnbonding && isDelegating && isElectionClosed) {
      availableActions.push({
        type: SubstrateStakingActionType.REBOND_EXTRA,
        args: ['value']
      })
    }

    if (isDelegating && isElectionClosed) {
      if (
        validatorAddresses.every((validator) => currentValidators.includes(validator)) &&
        validatorAddresses.length === currentValidators.length
      ) {
        availableActions.push({
          type: SubstrateStakingActionType.CANCEL_NOMINATION,
          args: ['value']
        })
      } else if (validatorAddresses.length > 0) {
        availableActions.push({
          type: SubstrateStakingActionType.CHANGE_NOMINATION,
          args: ['targets']
        })
      }
    }

    if (hasFundsToWithdraw && isElectionClosed) {
      availableActions.push({
        type: SubstrateStakingActionType.WITHDRAW_UNBONDED,
        args: []
      })
    }

    availableActions.sort((a, b) => a.type - b.type)

    return availableActions
  }

  private async getAccountIdentityInfo(address: SubstrateAddress): Promise<SubstrateIdentityInfo | null> {
    try {
      const registration = await this.nodeClient.getIdentityOf(address)

      if (registration) {
        return registration.identityInfo
      }

      const superOf = await this.nodeClient.getSuperOf(address)

      return superOf ? this.getAccountIdentityInfo(superOf.first.address) : null
    } catch {
      return null
    }
  }

  private partitionArray<T>(array: T[], predicate: (value: T) => boolean): [T[], T[]] {
    const partitioned: [T[], T[]] = [[], []]
    for (const item of array) {
      const index = predicate(item) ? 0 : 1
      partitioned[index].push(item)
    }

    return partitioned
  }
}

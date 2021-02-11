// tslint:disable:ordered-imports
// This needs to be imported first, otherwise the tests won't run anymore
import { EthereumProtocol } from './protocols/ethereum/EthereumProtocol'

import { ProtocolNotSupported, ProtocolVersionMismatch, SerializerVersionMismatch, TypeNotSupported } from './errors'
import { IAirGapTransaction } from './interfaces/IAirGapTransaction'
import { IAirGapWallet } from './interfaces/IAirGapWallet'
import { AeternityProtocol } from './protocols/aeternity/AeternityProtocol'
import { BitcoinProtocol } from './protocols/bitcoin/BitcoinProtocol'
import { BitcoinTestnetProtocol } from './protocols/bitcoin/BitcoinTestnetProtocol'
import { CosmosProtocol } from './protocols/cosmos/CosmosProtocol'
import { GenericERC20 } from './protocols/ethereum/erc20/GenericERC20'
import { EthereumClassicProtocol } from './protocols/ethereum/EthereumClassicProtocol'
import { EthereumRopstenProtocol } from './protocols/ethereum/EthereumRopstenProtocol'
import { GroestlcoinProtocol } from './protocols/groestlcoin/GroestlcoinProtocol'
import { GroestlcoinTestnetProtocol } from './protocols/groestlcoin/GroestlcoinTestnetProtocol'
import { ICoinDelegateProtocol } from './protocols/ICoinDelegateProtocol'
import { FeeDefaults, ICoinProtocol } from './protocols/ICoinProtocol'
import { ICoinSubProtocol } from './protocols/ICoinSubProtocol'
import { SubstratePayee } from './protocols/substrate/helpers/data/staking/SubstratePayee'
import { KusamaProtocol } from './protocols/substrate/implementations/KusamaProtocol'
import { PolkadotProtocol } from './protocols/substrate/implementations/PolkadotProtocol'
import { SubstrateProtocol } from './protocols/substrate/SubstrateProtocol'
import { TezosBTC } from './protocols/tezos/fa/TezosBTC'
import { TezosFAProtocol } from './protocols/tezos/fa/TezosFAProtocol'
import { TezosStaker } from './protocols/tezos/fa/TezosStaker'
import { TezosKtProtocol } from './protocols/tezos/kt/TezosKtProtocol'
import { TezosUSD } from './protocols/tezos/fa/TezosUSD'
import {
  BakerInfo,
  DelegationInfo,
  DelegationRewardInfo,
  TezosDelegatorAction,
  TezosNetwork,
  TezosPayoutInfo,
  TezosProtocol
} from './protocols/tezos/TezosProtocol'
import { IACMessageType } from './serializer/interfaces'
import { IACMessageDefinitionObject } from './serializer/message'
import { AccountShareResponse } from './serializer/schemas/definitions/account-share-response'
import { MessageSignRequest } from './serializer/schemas/definitions/message-sign-request'
import { MessageSignResponse } from './serializer/schemas/definitions/message-sign-response'
import { SignedTransaction } from './serializer/schemas/definitions/signed-transaction'
import { SignedAeternityTransaction } from './serializer/schemas/definitions/signed-transaction-aeternity'
import { SignedBitcoinTransaction } from './serializer/schemas/definitions/signed-transaction-bitcoin'
import { SignedCosmosTransaction } from './serializer/schemas/definitions/signed-transaction-cosmos'
import { SignedEthereumTransaction } from './serializer/schemas/definitions/signed-transaction-ethereum'
import { SignedTezosTransaction } from './serializer/schemas/definitions/signed-transaction-tezos'
import { UnsignedTransaction } from './serializer/schemas/definitions/unsigned-transaction'
import { UnsignedAeternityTransaction } from './serializer/schemas/definitions/unsigned-transaction-aeternity'
import { UnsignedBitcoinTransaction } from './serializer/schemas/definitions/unsigned-transaction-bitcoin'
import { UnsignedEthereumTransaction } from './serializer/schemas/definitions/unsigned-transaction-ethereum'
import { UnsignedTezosTransaction } from './serializer/schemas/definitions/unsigned-transaction-tezos'
import { IACPayloadType, Serializer } from './serializer/serializer'
import { UnsignedCosmosTransaction } from './serializer/types'
import { isCoinlibReady } from './utils/coinlibReady'
import { getProtocolByIdentifier } from './utils/protocolsByIdentifier'
import { addSubProtocol, getSubProtocolsByIdentifier } from './utils/subProtocols'
import { addSupportedProtocol, supportedProtocols } from './utils/supportedProtocols'
import { AirGapMarketWallet } from './wallet/AirGapMarketWallet'
import { AirGapWallet } from './wallet/AirGapWallet'
import { AeternityProtocolOptions, AeternalBlockExplorer, AeternityProtocolNetwork } from './protocols/aeternity/AeternityProtocolOptions'
import { AeternityCryptoClient } from './protocols/aeternity/AeternityCryptoClient'
import { BitcoinCryptoClient } from './protocols/bitcoin/BitcoinCryptoClient'
import {
  BitcoinProtocolNetworkExtras,
  BitcoinProtocolNetwork,
  BitcoinProtocolConfig,
  BlockcypherBlockExplorer,
  BitcoinProtocolOptions
} from './protocols/bitcoin/BitcoinProtocolOptions'
import { CosmosCryptoClient } from './protocols/cosmos/CosmosCryptoClient'
import {
  MintscanBlockExplorer,
  CosmosProtocolNetwork,
  CosmosProtocolConfig,
  CosmosProtocolOptions
} from './protocols/cosmos/CosmosProtocolOptions'
import { EthereumCryptoClient } from './protocols/ethereum/EthereumCryptoClient'
import { SubstrateCryptoClient } from './protocols/substrate/SubstrateCryptoClient'
import { TezosCryptoClient } from './protocols/tezos/TezosCryptoClient'
import {
  EthereumProtocolNetworkExtras,
  EtherscanBlockExplorer,
  EthereumProtocolNetwork,
  EthereumProtocolConfig,
  EthereumProtocolOptions,
  EthereumERC20ProtocolConfig,
  EthereumERC20ProtocolOptions
} from './protocols/ethereum/EthereumProtocolOptions'
import { ProtocolBlockExplorer } from './utils/ProtocolBlockExplorer'
import { NetworkType, ProtocolNetwork } from './utils/ProtocolNetwork'
import {
  GroestlcoinProtocolNetworkExtras,
  CryptoidBlockExplorer,
  GroestlcoinProtocolNetwork,
  GroestlcoinProtocolConfig,
  GroestlcoinProtocolOptions
} from './protocols/groestlcoin/GroestlcoinProtocolOptions'
import {
  SubstrateProtocolNetworkExtras,
  PolkascanBlockExplorer,
  SubstrateProtocolConfig,
  SubstrateProtocolNetwork,
  SubstrateProtocolOptions
} from './protocols/substrate/SubstrateProtocolOptions'
import {
  KusamaProtocolNetworkExtras,
  KusamaPolkascanBlockExplorer,
  KusamaProtocolConfig,
  KusamaProtocolNetwork,
  KusamaProtocolOptions
} from './protocols/substrate/implementations/KusamaProtocolOptions'
import {
  PolkadotProtocolNetworkExtras,
  PolkadotPolkascanBlockExplorer,
  PolkadotProtocolConfig,
  PolkadotProtocolNetwork,
  PolkadotProtocolOptions
} from './protocols/substrate/implementations/PolkadotProtocolOptions'
import { CryptoClient } from './protocols/CryptoClient'
import {
  TezosProtocolNetworkExtras,
  TezblockBlockExplorer,
  TezosProtocolNetwork,
  TezosProtocolConfig,
  TezosProtocolOptions
} from './protocols/tezos/TezosProtocolOptions'
import {
  TezosFAProtocolConfig,
  TezosBTCProtocolConfig,
  TezosStakerProtocolConfig,
  TezosUSDProtocolConfig,
  TezosFAProtocolOptions,
  TezosFA2ProtocolConfig,
  TezosFA2ProtocolOptions
} from './protocols/tezos/fa/TezosFAProtocolOptions'
import { TezosTransactionResult } from './protocols/tezos/types/TezosTransactionResult'
import { TezosTransactionCursor } from './protocols/tezos/types/TezosTransactionCursor'
import { generateId } from "./serializer/utils/generateId"
import { ProtocolSymbols, MainProtocolSymbols, SubProtocolSymbols } from "./utils/ProtocolSymbols"
import { TezosUtils } from './protocols/tezos/TezosUtils'
import { TezosFA2Protocol } from './protocols/tezos/fa/TezosFA2Protocol'
import { TezosFA1Protocol } from './protocols/tezos/fa/TezosFA1Protocol'
import { TezosFA12Protocol } from './protocols/tezos/fa/TezosFA12Protocol'
// tslint:enable:ordered-imports

// Core
export {
  AirGapWallet,
  AirGapMarketWallet,
  IAirGapWallet,
  IAirGapTransaction,
  ICoinProtocol,
  ICoinSubProtocol,
  ICoinDelegateProtocol,
  CryptoClient,
  ProtocolBlockExplorer,
  ProtocolNetwork,
  ProtocolSymbols,
  MainProtocolSymbols,
  SubProtocolSymbols,
  NetworkType,
  FeeDefaults
}

// Aeternity
export { AeternityProtocol, AeternityCryptoClient, AeternityProtocolOptions, AeternalBlockExplorer, AeternityProtocolNetwork }

// Bitcoin
export {
  BitcoinProtocol,
  BitcoinTestnetProtocol,
  BitcoinCryptoClient,
  BitcoinProtocolNetworkExtras,
  BlockcypherBlockExplorer,
  BitcoinProtocolNetwork,
  BitcoinProtocolConfig,
  BitcoinProtocolOptions
}

// Cosmos
export { CosmosProtocol, CosmosCryptoClient, MintscanBlockExplorer, CosmosProtocolNetwork, CosmosProtocolConfig, CosmosProtocolOptions }

// Ethereum
export {
  EthereumProtocol,
  EthereumRopstenProtocol,
  EthereumClassicProtocol,
  GenericERC20,
  EthereumCryptoClient,
  EthereumProtocolNetworkExtras,
  EtherscanBlockExplorer,
  EthereumProtocolNetwork,
  EthereumProtocolConfig,
  EthereumProtocolOptions,
  EthereumERC20ProtocolConfig,
  EthereumERC20ProtocolOptions
}

// Groestlcoin
export {
  GroestlcoinProtocol,
  GroestlcoinTestnetProtocol,
  GroestlcoinProtocolNetworkExtras,
  CryptoidBlockExplorer,
  GroestlcoinProtocolNetwork,
  GroestlcoinProtocolConfig,
  GroestlcoinProtocolOptions
}

// Substrate
export {
  SubstrateProtocol,
  PolkadotProtocol,
  KusamaProtocol,
  SubstratePayee,
  SubstrateCryptoClient,
  SubstrateProtocolNetworkExtras,
  PolkascanBlockExplorer,
  SubstrateProtocolConfig,
  SubstrateProtocolNetwork,
  SubstrateProtocolOptions,
  KusamaProtocolNetworkExtras,
  KusamaPolkascanBlockExplorer,
  KusamaProtocolConfig,
  KusamaProtocolNetwork,
  KusamaProtocolOptions,
  PolkadotProtocolNetworkExtras,
  PolkadotPolkascanBlockExplorer,
  PolkadotProtocolConfig,
  PolkadotProtocolNetwork,
  PolkadotProtocolOptions
}

// Tezos
export {
  TezosProtocol,
  TezosKtProtocol,
  TezosFAProtocol,
  TezosFA1Protocol,
  TezosFA12Protocol,
  TezosFA2Protocol,
  TezosBTC,
  TezosStaker,
  TezosUSD,
  TezosTransactionResult,
  TezosTransactionCursor,
  BakerInfo,
  DelegationRewardInfo,
  DelegationInfo,
  TezosPayoutInfo,
  TezosDelegatorAction,
  TezosCryptoClient,
  TezosProtocolNetworkExtras,
  TezblockBlockExplorer,
  TezosProtocolNetwork,
  TezosProtocolConfig,
  TezosProtocolOptions,
  TezosFAProtocolConfig,
  TezosFA2ProtocolConfig,
  TezosBTCProtocolConfig,
  TezosStakerProtocolConfig,
  TezosUSDProtocolConfig,
  TezosFAProtocolOptions,
  TezosFA2ProtocolOptions,
  TezosNetwork,
  TezosUtils
}

// Serializer
export {
  IACMessageType,
  IACMessageDefinitionObject,
  AccountShareResponse,
  MessageSignRequest,
  MessageSignResponse,
  SignedTransaction,
  UnsignedTransaction,
  UnsignedAeternityTransaction,
  UnsignedBitcoinTransaction,
  UnsignedCosmosTransaction,
  UnsignedEthereumTransaction,
  UnsignedTezosTransaction,
  SignedAeternityTransaction,
  SignedBitcoinTransaction,
  SignedCosmosTransaction,
  SignedEthereumTransaction,
  SignedTezosTransaction,
  IACPayloadType,
  Serializer
}

// Helper
export {
  addSupportedProtocol,
  getProtocolByIdentifier,
  getSubProtocolsByIdentifier,
  supportedProtocols,
  // sub protocols configs,
  TypeNotSupported,
  SerializerVersionMismatch,
  ProtocolNotSupported,
  ProtocolVersionMismatch,
  // libsodium ready
  isCoinlibReady,
  // sub-protocols
  addSubProtocol,
  generateId
}
import { toHex } from 'web3-utils'
import { concatHexData, toPartition } from './helpers'

export const ZERO_BYTE = '0x'
export const ZERO_BYTES4 = '0x00000000'
export const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Transfer data flags
export const FLAG_CHANGE_PARTITION =
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

// Transfer operator data flags
export const FLAG_WITHDRAWAL =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
export const FLAG_WITHDRAWAL_FALLBACK =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
export const FLAG_REFUND =
  '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
export const FLAG_DIRECT_TRANSFER =
  '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'

// Partitions
export const DEFAULT_PARTITION = ZERO_BYTES32
export const ALT_PARTITION_1 = toPartition(toHex('dope'))
export const ALT_PARTITION_2 = toPartition(toHex('super dope'))
export const SWITCH_TO_DEFAULT_PARTITION = concatHexData(
  FLAG_CHANGE_PARTITION,
  DEFAULT_PARTITION
)
export const PREFIX_COLLATERAL_POOL = '0xCCCCCCCC'

// Events
export const EVENT_DIRECT_TRANSFERER_UPDATE = 'DirectTransfererUpdate'
export const EVENT_DIRECT_TRANSFER = 'DirectTransfer'
export const EVENT_FALLBACK_MECHANISM_DATE_RESET = 'FallbackMechanismDateReset'
export const EVENT_FALLBACK_PUBLISHER_UPDATE = 'FallbackPublisherUpdate'
export const EVENT_FALLBACK_ROOT_HASH_SET = 'FallbackRootHashSet'
export const EVENT_FALLBACK_WITHDRAWAL = 'FallbackWithdrawal'
export const EVENT_FALLBACK_WITHDRAWAL_DELAY_UPDATE = 'FallbackWithdrawalDelayUpdate'
export const EVENT_OWNER_UPDATE = 'OwnerUpdate'
export const EVENT_OWNERSHIP_TRANSFER_AUTHORIZATION = 'OwnershipTransferAuthorization'
export const EVENT_PARTITION_ADDED = 'PartitionAdded'
export const EVENT_PARTITION_MANAGER_UPDATE = 'PartitionManagerUpdate'
export const EVENT_PARTITION_REMOVED = 'PartitionRemoved'
export const EVENT_RELEASE_REQUEST = 'ReleaseRequest'
export const EVENT_RENOUNCE_WITHDRAWAL_AUTHORIZATION = 'RenounceWithdrawalAuthorization'
export const EVENT_SUPPLY_RECEIPT = 'SupplyReceipt'
export const EVENT_SUPPLY_REFUND = 'SupplyRefund'
export const EVENT_WITHDRAWAL = 'Withdrawal'
export const EVENT_WITHDRAWAL_LIMIT_PUBLISHER_UPDATE = 'WithdrawalLimitPublisherUpdate'
export const EVENT_WITHDRAWAL_LIMIT_UPDATE = 'WithdrawalLimitUpdate'
export const EVENT_WITHDRAWAL_PUBLISHER_UPDATE = 'WithdrawalPublisherUpdate'
export const EVENT_WITHDRAWAL_ROOT_HASH_ADDITION = 'WithdrawalRootHashAddition'
export const EVENT_WITHDRAWAL_ROOT_HASH_REMOVAL = 'WithdrawalRootHashRemoval'

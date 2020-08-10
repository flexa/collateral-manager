import { shouldFail } from 'openzeppelin-test-helpers'
import {
  Constants,
  Helpers
} from '../utils'

const MockFXC = artifacts.require('MockFXC')
const Amp = artifacts.require('Amp')
const CollateralPoolPartitionValidator = artifacts.require('CollateralPoolPartitionValidator')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { BN } = web3.utils
const {
  ZERO_BYTE,
  DEFAULT_PARTITION,
  SWITCH_TO_DEFAULT_PARTITION,
  FLAG_DIRECT_TRANSFER,
  FLAG_CHANGE_PARTITION,
  PREFIX_COLLATERAL_POOL,
  EVENT_DIRECT_TRANSFER
} = Constants
const {
  concatHexData,
  formatCollateralPartition,
  generateOperatorData,
} = Helpers

const initialWithdrawalLimit = 2000
const supplyAmount = 10000
const directTransferAmount = 500
const directTransferOperatorData = generateOperatorData(FLAG_DIRECT_TRANSFER)

contract('Integration - FlexaCollateralManager', function ([
  fxcOwner,
  ampOwner,
  owner,
  directTransferer,
  supplier,
  unknown,
]) {
  before(async function () {
    this.fxc = await MockFXC.new(
      { from: fxcOwner }
    )
    this.amp = await Amp.new(
      this.fxc.address,
      '',
      '',
      { from: ampOwner }
    )
    this.validator = await CollateralPoolPartitionValidator.new(
      this.amp.address,
      { from: ampOwner }
    )

    await this.amp.setPartitionStrategy(
      PREFIX_COLLATERAL_POOL,
      this.validator.address,
      { from: ampOwner }
    )

    this.collateralManager = await FlexaCollateralManager.new(
      this.amp.address,
      { from: owner }
    )
    await this.collateralManager.setDirectTransferer(
      directTransferer,
      { from: owner }
    )

    this.partitionA = formatCollateralPartition(
      this.collateralManager.address,
      'A',
    )
    this.switchToPartitionA = concatHexData(
      FLAG_CHANGE_PARTITION,
      this.partitionA
    )

    await this.collateralManager.addPartition(
      this.partitionA,
      { from: owner }
    )

    await this.fxc.mint(
      supplier,
      supplyAmount,
      { from: fxcOwner }
    )
    await this.fxc.approve(
      this.amp.address,
      supplyAmount,
      { from: supplier }
    )
    await this.amp.swap(
      supplier,
      { from: supplier }
    )

    await this.amp.transferByPartition(
      DEFAULT_PARTITION, // _partition,
      supplier, // _from,
      this.collateralManager.address, // _to,
      supplyAmount, // _value,
      this.switchToPartitionA, // calldata _data,
      ZERO_BYTE, // calldata _operatorData
      { from: supplier }
    )
  })

  describe('DirectTransfer', function () {
    var allowedRoles = [
      { name: 'owner', address: owner },
      { name: 'directTransferer', address: directTransferer }
    ]

    allowedRoles.forEach(function (role) {
      describe('when the ' + role.name + ' direct transfers', function () {
        beforeEach(async function () {
          const limit = await this.collateralManager.withdrawalLimit()
          const delta = new BN(0).sub(new BN(limit)).add(new BN(initialWithdrawalLimit))

          await this.collateralManager.modifyWithdrawalLimit(
            delta,
            { from: owner }
          )

          await this.amp.transferByPartition(
            this.partitionA, // _partition,
            this.collateralManager.address, // _from,
            role.address, // _to,
            directTransferAmount, // _value,
            SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
            directTransferOperatorData, // calldata _operatorData
            { from: role.address }
          )
        })

        it('emits an event', async function () {
          const logs = await this.collateralManager.getPastEvents()
          let supplyEvent = logs[0];

          assert.equal(supplyEvent.event, EVENT_DIRECT_TRANSFER)
          assert.equal(supplyEvent.args.operator, role.address)
          assert.equal(supplyEvent.args.from_partition, this.partitionA)
          assert.equal(supplyEvent.args.to_address, role.address)
          assert.equal(supplyEvent.args.to_partition, DEFAULT_PARTITION)
          assert.equal(supplyEvent.args.value, directTransferAmount)
        })

        it('decreases the withdrawal limit', async function () {
          const limit = await this.collateralManager.withdrawalLimit()

          assert.equal(1500, limit.toNumber())
        })
      })
    })

    describe('when the direct transfer exceeds the limit', () => {
      beforeEach(async function () {
        const limit = await this.collateralManager.withdrawalLimit()
        const delta = new BN(0).sub(new BN(limit)).add(new BN(100))

        await this.collateralManager.modifyWithdrawalLimit(
          delta,
          { from: owner }
        )
      })

      it('reverts', async function () {
        await shouldFail.reverting(
          this.amp.transferByPartition(
            this.partitionA, // _partition,
            this.collateralManager.address, // _from,
            owner, // _to,
            directTransferAmount, // _value,
            SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
            directTransferOperatorData, // calldata _operatorData
            { from: owner }
          )
        )
      })
    })

    describe('when an unauthorized user direct transfers', () => {
      it('reverts', async function () {
        await shouldFail.reverting(
          this.amp.transferByPartition(
            this.partitionA, // _partition,
            this.collateralManager.address, // _from,
            unknown, // _to,
            directTransferAmount, // _value,
            SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
            directTransferOperatorData, // calldata _operatorData
            { from: unknown }
          )
        )
      })
    })
  })
})

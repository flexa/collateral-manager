import { shouldFail } from 'openzeppelin-test-helpers'
import {
  Constants,
  Helpers
} from './utils'
import { DEFAULT_PARTITION } from './utils/constants'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { BN } = web3.utils
const {
  ZERO_BYTES4,
  ALT_PARTITION_1,
  SWITCH_TO_DEFAULT_PARTITION,
  FLAG_DIRECT_TRANSFER,
  EVENT_DIRECT_TRANSFER
} = Constants
const {
  generateOperatorData,
} = Helpers

const initialWithdrawalLimit = 2000
const directTransferAmount = 500
const directTransferOperatorData = generateOperatorData(FLAG_DIRECT_TRANSFER)

contract('FlexaCollateralManager', function ([
  owner,
  directTransferer,
  unknown,
]) {
  before(async function () {
    this.amp = await MockAmp.deployed()
    this.collateralManager = await FlexaCollateralManager.new(
      this.amp.address,
      { from: owner }
    )
    await this.collateralManager.setDirectTransferer(
      directTransferer,
      { from: owner }
    )
  })

  describe('DirectTransfer', function () {
    describe('when the operator is unknown', function () {
      it('reverts', async function () {
        await shouldFail.reverting(
          this.amp.tokensToTransfer(
            ZERO_BYTES4, // _functionSig
            ALT_PARTITION_1, // _partition
            unknown, // _operator
            this.collateralManager.address, // _from
            unknown, // to
            directTransferAmount, // _value
            SWITCH_TO_DEFAULT_PARTITION, // data
            directTransferOperatorData, // _operatorData
            { from: unknown }
          )
        )
      })
    })

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

          await this.amp.tokensToTransfer(
            ZERO_BYTES4, // _functionSig
            ALT_PARTITION_1, // _partition
            role.address, // _operator
            this.collateralManager.address, // _from
            unknown, // to
            directTransferAmount, // _value
            SWITCH_TO_DEFAULT_PARTITION, // data
            directTransferOperatorData, // _operatorData
            { from: role.address }
          )
        })

        it('emits an event', async function () {
          const logs = await this.collateralManager.getPastEvents()
          let supplyEvent = logs[0];

          assert.equal(supplyEvent.event, EVENT_DIRECT_TRANSFER)
          assert.equal(supplyEvent.args.operator, role.address)
          assert.equal(supplyEvent.args.from_partition, ALT_PARTITION_1)
          assert.equal(supplyEvent.args.to_address, unknown)
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
          this.amp.tokensToTransfer(
            ZERO_BYTES4, // _functionSig
            ALT_PARTITION_1, // _partition
            owner, // _operator
            this.collateralManager.address, // _from
            unknown, // to
            directTransferAmount, // _value
            SWITCH_TO_DEFAULT_PARTITION, // data
            directTransferOperatorData, // _operatorData
            { from: owner }
          )
        )
      })
    })

    describe('when an unauthorized user directTransfers', () => {
      it('reverts', async function () {
        await shouldFail.reverting(
          this.amp.tokensToTransfer(
            ZERO_BYTES4, // _functionSig
            ALT_PARTITION_1, // _partition
            unknown, // _operator
            this.collateralManager.address, // _from
            unknown, // to
            directTransferAmount, // _value
            SWITCH_TO_DEFAULT_PARTITION, // data
            directTransferOperatorData, // _operatorData
            { from: unknown }
          )
        )
      })
    })
  })
})

import { shouldFail } from 'openzeppelin-test-helpers'
import {
  Constants,
  Helpers
} from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { BN } = web3.utils
const {
  ZERO_BYTES4,
  ALT_PARTITION_1,
  SWITCH_TO_DEFAULT_PARTITION,
  FLAG_CONSUMPTION,
  EVENT_CONSUMPTION
} = Constants
const {
  assertRevertErrMsg,
  generateOperatorData,
} = Helpers

const initialWithdrawalLimit = 2000
const consumeAmount = 500
const consumeOperatorData = generateOperatorData(FLAG_CONSUMPTION)

contract('FlexaCollateralManager', function ([
  owner,
  consumer,
  unknown,
]) {
  before(async function () {
    this.amp = await MockAmp.deployed()
    this.collateralManager = await FlexaCollateralManager.new(
      this.amp.address,
      { from: owner }
    )
    await this.collateralManager.setConsumer(
      consumer,
      { from: owner }
    )
  })

  describe('Consuming', function () {
    describe('when the operator is unknown', function () {
      it('reverts', async function () {
        await shouldFail.reverting(
          this.amp.tokensToTransfer(
            ZERO_BYTES4, // _functionSig
            ALT_PARTITION_1, // _partition
            unknown, // _operator
            this.collateralManager.address, // _from
            unknown, // to
            consumeAmount, // _value
            SWITCH_TO_DEFAULT_PARTITION, // data
            consumeOperatorData, // _operatorData
            { from: unknown }
          )
        )
      })
    })

    var allowedRoles = [
      { name: 'owner', address: owner },
      { name: 'consumer', address: consumer }
    ]

    allowedRoles.forEach(function (role) {
      describe('when the ' + role.name + ' consumes', function () {
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
            consumeAmount, // _value
            SWITCH_TO_DEFAULT_PARTITION, // data
            consumeOperatorData, // _operatorData
            { from: role.address }
          )
        })

        it('emits an event', async function () {
          const logs = await this.collateralManager.getPastEvents()
          let supplyEvent = logs[0];

          assert.equal(supplyEvent.event, EVENT_CONSUMPTION)
          assert.equal(supplyEvent.args.operator, role.address)
          assert.equal(supplyEvent.args.partition, ALT_PARTITION_1)
          assert.equal(supplyEvent.args.value, consumeAmount)
        })

        it('decreases the withdrawal limit', async function () {
          const limit = await this.collateralManager.withdrawalLimit()

          assert.equal(1500, limit.toNumber())
        })
      })
    })

    describe('when the consumption exceeds the limit', () => {
      beforeEach(async function () {
        const limit = await this.collateralManager.withdrawalLimit()
        const delta = new BN(0).sub(new BN(limit)).add(new BN(100))

        await this.collateralManager.modifyWithdrawalLimit(
          delta,
          { from: owner }
        )
      })

      it('reverts', async function () {
        await assertRevertErrMsg(
          this.amp.tokensToTransfer(
            ZERO_BYTES4, // _functionSig
            ALT_PARTITION_1, // _partition
            owner, // _operator
            this.collateralManager.address, // _from
            unknown, // to
            consumeAmount, // _value
            SWITCH_TO_DEFAULT_PARTITION, // data
            consumeOperatorData, // _operatorData
            { from: owner }
          ),
          'Transfer unauthorized'
        )
      })
    })

    describe('when an unauthorized user consumes', () => {
      it('reverts', async function () {
        await assertRevertErrMsg(
          this.amp.tokensToTransfer(
            ZERO_BYTES4, // _functionSig
            ALT_PARTITION_1, // _partition
            unknown, // _operator
            this.collateralManager.address, // _from
            unknown, // to
            consumeAmount, // _value
            SWITCH_TO_DEFAULT_PARTITION, // data
            consumeOperatorData, // _operatorData
            { from: unknown }
          ),
          'Transfer unauthorized'
        )
      })
    })
  })
})

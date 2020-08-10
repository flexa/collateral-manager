import { shouldFail } from 'openzeppelin-test-helpers'
import { Constants, Helpers } from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const {
  ZERO_BYTE,
  ZERO_BYTES4,
  EVENT_SUPPLY_RECEIPT,
  DEFAULT_PARTITION,
  FLAG_CHANGE_PARTITION
} = Constants
const {
  concatHexData,
  formatCollateralPartition,
} = Helpers

contract('FlexaCollateralManager', function ([
  owner,
  tokenHolder,
  operator,
  unknown
]) {
  describe('TokensReceived', function () {
    beforeEach(async function () {
      this.amp = await MockAmp.deployed()
      this.collateralManager = await FlexaCollateralManager.new(
        this.amp.address,
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
    })

    describe('when the partition is permitted', () => {
      beforeEach(async function () {
        await this.collateralManager.addPartition(
          this.partitionA,
          { from: owner }
        )
      })

      var supplyAmounts = [500, 0]

      supplyAmounts.forEach(function (supplyAmount) {
        describe('when ' + supplyAmount + ' tokens are received', () => {
          it('records the supply', async function () {
            const supplyNonce_beforeSupply = Number(
              (await this.collateralManager.supplyNonce.call()).toString()
            )

            await this.amp.tokensReceived(
              ZERO_BYTES4,
              DEFAULT_PARTITION,
              operator,
              tokenHolder,
              this.collateralManager.address,
              supplyAmount,
              this.switchToPartitionA,
              ZERO_BYTE,
              { from: unknown }
            )

            const supplyNonce_afterSupply = Number(
              (await this.collateralManager.supplyNonce.call()).toString()
            )

            assert.equal(supplyNonce_afterSupply, supplyNonce_beforeSupply + 1)
          })

          it('emits a SupplyReceipt event', async function () {
            const supplyNonce_beforeSupply = Number(
              (await this.collateralManager.supplyNonce.call()).toString()
            )

            await this.amp.tokensReceived(
              ZERO_BYTES4,
              DEFAULT_PARTITION,
              operator,
              tokenHolder,
              this.collateralManager.address,
              supplyAmount,
              this.switchToPartitionA,
              ZERO_BYTE,
              { from: unknown }
            )

            const logs = await this.collateralManager.getPastEvents()
            let supplyEvent = logs[0];

            assert.equal(supplyEvent.event, EVENT_SUPPLY_RECEIPT)
            assert.equal(supplyEvent.args.supplier, operator)
            assert.equal(supplyEvent.args.partition, this.partitionA)

            assert.equal(
              Number(supplyEvent.args.amount.toString()),
              supplyAmount
            )
            assert.equal(
              Number(supplyEvent.args.nonce.toString()),
              supplyNonce_beforeSupply + 1
            )
          })
        })
      })
    })

    describe('when the partition is not permitted', () => {
      it('reverts', async function () {
        await shouldFail.reverting(
          this.amp.tokensReceived(
            ZERO_BYTES4,
            DEFAULT_PARTITION,
            operator,
            tokenHolder,
            this.collateralManager.address,
            500,
            this.switchToPartitionA,
            ZERO_BYTE,
            { from: unknown }
          )
        )
      })
    })
  })
})

import { shouldFail } from 'openzeppelin-test-helpers'
import { Constants, Helpers } from '../utils'

const MockFXC = artifacts.require('MockFXC')
const Amp = artifacts.require('Amp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const CollateralPoolPartitionValidator = artifacts.require('CollateralPoolPartitionValidator')
const {
  ZERO_BYTE,
  FLAG_CHANGE_PARTITION,
  DEFAULT_PARTITION,
  PREFIX_COLLATERAL_POOL,
  EVENT_SUPPLY_RECEIPT,
} = Constants
const {
  concatHexData,
  formatCollateralPartition,
} = Helpers

contract('Integration - FlexaCollateralManager', function ([
  fxcOwner,
  ampOwner,
  owner,
  supplier,
  operator,
]) {
  describe('TokensReceived', function () {
    beforeEach(async function () {
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

      this.partitionA = formatCollateralPartition(
        this.collateralManager.address,
        'A',
      )
      this.switchToPartitionA = concatHexData(
        FLAG_CHANGE_PARTITION,
        this.partitionA
      )

      await this.fxc.mint(
        supplier,
        10000,
        { from: fxcOwner }
      )
      await this.fxc.approve(
        this.amp.address,
        10000,
        { from: supplier }
      )
      await this.amp.swap(
        supplier,
        { from: supplier }
      )

      await this.fxc.mint(
        owner,
        10000,
        { from: fxcOwner }
      )
      await this.fxc.approve(
        this.amp.address,
        10000,
        { from: owner }
      )
      await this.amp.swap(
        owner,
        { from: owner }
      )

      await this.collateralManager.addPartition(
        this.partitionA,
        { from: owner }
      )

      await this.amp.transferByPartition(
        DEFAULT_PARTITION, // _partition,
        owner, // _from,
        this.collateralManager.address, // _to,
        1, // _value,
        this.switchToPartitionA, // calldata _data,
        ZERO_BYTE, // calldata _operatorData
        { from: owner }
      )

      await this.collateralManager.removePartition(
        this.partitionA,
        { from: owner }
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

            await this.amp.transferByPartition(
              DEFAULT_PARTITION, // _partition,
              supplier, // _from,
              this.collateralManager.address, // _to,
              supplyAmount, // _value,
              this.switchToPartitionA, // calldata _data,
              ZERO_BYTE, // calldata _operatorData
              { from: supplier }
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

            await this.amp.transferByPartition(
              DEFAULT_PARTITION, // _partition,
              supplier, // _from,
              this.collateralManager.address, // _to,
              supplyAmount, // _value,
              this.switchToPartitionA, // calldata _data,
              ZERO_BYTE, // calldata _operatorData
              { from: supplier }
            )

            const logs = await this.collateralManager.getPastEvents()
            let supplyEvent = logs[0];

            assert.equal(supplyEvent.event, EVENT_SUPPLY_RECEIPT)
            assert.equal(supplyEvent.args.supplier, supplier)
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


      describe('when an operator supplies for the supplier', () => {
        const supplyAmount = 100

        beforeEach(async function () {
          await this.amp.authorizeOperator(
            operator,
            { from: supplier }
          )

          await this.amp.transferByPartition(
            DEFAULT_PARTITION, // _partition,
            supplier, // _from,
            this.collateralManager.address, // _to,
            supplyAmount, // _value,
            this.switchToPartitionA, // calldata _data,
            ZERO_BYTE, // calldata _operatorData
            { from: operator }
          )
        })

        it('credits the operator in the recorded supply', async function () {
          const supplyNonce = await this.collateralManager.supplyNonce()
          const supply = await this.collateralManager.nonceToSupply(supplyNonce)

          assert.equal(supply.supplier, operator)
          assert.equal(supply.partition, this.partitionA)
          assert.equal(supply.amount.toNumber(), supplyAmount)
        })

        it('credits the operator in the SupplyReceipt event', async function () {
          const supplyNonce = await this.collateralManager.supplyNonce()

          const logs = await this.collateralManager.getPastEvents()
          let supplyEvent = logs[0];

          assert.equal(supplyEvent.event, EVENT_SUPPLY_RECEIPT)
          assert.equal(supplyEvent.args.supplier, operator)
          assert.equal(supplyEvent.args.partition, this.partitionA)
          assert.equal(supplyEvent.args.amount, supplyAmount)
          assert.ok(supplyEvent.args.nonce.eq(supplyNonce))
        })
      })
    })

    describe('when the partition is not permitted', () => {
      it('reverts', async function () {
        await shouldFail.reverting(
          this.amp.transferByPartition(
            DEFAULT_PARTITION, // _partition,
            supplier, // _from,
            this.collateralManager.address, // _to,
            500, // _value,
            this.switchToPartitionA, // calldata _data,
            ZERO_BYTE, // calldata _operatorData
            { from: supplier }
          )
        )
      })
    })
  })
})

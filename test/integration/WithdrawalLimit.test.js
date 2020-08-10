import { shouldFail } from 'openzeppelin-test-helpers'
import { Constants, Helpers } from '../utils'

const MockFXC = artifacts.require('MockFXC')
const Amp = artifacts.require('Amp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { BN } = web3.utils
const { EVENT_WITHDRAWAL_LIMIT_UPDATE } = Constants

const limitIncrease = 10
const limitDecrease = -10
const initialLimit = new BN(10).pow(new BN(23))

contract('Integration - FlexaCollateralManager', function ([
  fxcOwner,
  ampOwner,
  owner,
  withdrawalLimitPublisher,
  unknown,
]) {
  describe('Withdrawal Limit', () => {
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
      this.collateralManager = await FlexaCollateralManager.new(
        this.amp.address,
        { from: owner }
      )
      await this.collateralManager.setWithdrawalLimitPublisher(
        withdrawalLimitPublisher,
        { from: owner }
      )
    })

    it('sets default withdrawal limit', async function () {
      const limit = await this.collateralManager.withdrawalLimit()

      assert.equal(
        limit.toString(),
        initialLimit.toString()
      )
    })

    describe('when owner modifies the limit by a positive value', () => {
      beforeEach(async function () {
        await this.collateralManager.modifyWithdrawalLimit(
          limitIncrease,
          { from: owner }
        )
      })

      it('increases the limit', async function () {
        const limit = await this.collateralManager.withdrawalLimit()
        const expectedLimit = initialLimit.add(new BN(limitIncrease))

        assert.equal(
          limit.toString(),
          expectedLimit.toString()
        )
      })

      it('emits an event', async function () {
        const expectedLimit = initialLimit.add(new BN(limitIncrease))
        const logs = await this.collateralManager.getPastEvents()
        const event = logs[0];

        assert.equal(event.event, EVENT_WITHDRAWAL_LIMIT_UPDATE)
        assert.equal(event.args.oldValue, initialLimit.toString())
        assert.equal(event.args.newValue, expectedLimit.toString())
      })
    })

    describe('when owner modifies the limit by a negative value', () => {
      beforeEach(async function () {
        await this.collateralManager.modifyWithdrawalLimit(
          limitDecrease,
          { from: owner }
        )
      })

      it('decreases the limit', async function () {
        const limit = await this.collateralManager.withdrawalLimit()
        const expectedLimit = initialLimit.add(new BN(limitDecrease))

        assert.equal(
          limit.toString(),
          expectedLimit.toString()
        )
      })

      it('emits an event', async function () {
        const expectedLimit = initialLimit.add(new BN(limitDecrease))
        const logs = await this.collateralManager.getPastEvents()
        const event = logs[0];

        assert.equal(event.event, EVENT_WITHDRAWAL_LIMIT_UPDATE)
        assert.equal(event.args.oldValue, initialLimit.toString())
        assert.equal(event.args.newValue, expectedLimit.toString())
      })
    })

    describe('when the withdrawal limit publisher modifies the limit', () => {
      it('is allowed', async function () {
        await this.collateralManager.modifyWithdrawalLimit(
          limitIncrease,
          { from: withdrawalLimitPublisher }
        )
      })
    })

    describe('when unauthorized caller modifies the limit', () => {
      it('reverts', async function () {
        await shouldFail.reverting(
          this.collateralManager.modifyWithdrawalLimit(
            limitIncrease,
            { from: unknown }
          )
        )
      })
    })

    describe('when modifying the limit to below zero', () => {
      it('reverts', async function () {
        const underflow = initialLimit.neg().sub(new BN(1))

        await shouldFail.reverting(
          this.collateralManager.modifyWithdrawalLimit(
            underflow,
            { from: owner }
          )
        )
      })
    })

    describe('when modifying the limit to above max uint256', () => {
      it('reverts', async function () {
        // NB: The function must be called twice becuase it accepts an int256, but allows increases
        // up to max uint256. When the initial value is less than max_uint256/2, then it is not
        // possible to overflow in a single call.
        const halfOverflow = new BN(2).pow(new BN(255)).sub(new BN(1))

        await this.collateralManager.modifyWithdrawalLimit(
          halfOverflow,
          { from: owner }
        )

        await shouldFail.reverting(
          this.collateralManager.modifyWithdrawalLimit(
            halfOverflow,
            { from: owner }
          )
        )
      })
    })
  })
})
import { shouldFail } from 'openzeppelin-test-helpers'
import { Constants } from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { ZERO_ADDRESS, EVENT_WITHDRAWAL_LIMIT_PUBLISHER_UPDATE } = Constants

contract('FlexaCollateralManager', function ([
  owner,
  withdrawalLimitPublisher,
  unknown,
]) {
  describe('Withdrawal Limit Publisher', () => {
    beforeEach(async function () {
      this.amp = await MockAmp.deployed()
      this.collateralManager = await FlexaCollateralManager.new(
        this.amp.address,
        { from: owner }
      )
    })

    it('sets the initial withdrawal limit publisher to the zero address', async function () {
      const currentPublisher = await this.collateralManager.withdrawalLimitPublisher()

      assert.equal(currentPublisher, ZERO_ADDRESS)
    })

    describe('when owner sets the withdrawal limit publisher', () => {
      beforeEach(async function () {
        await this.collateralManager.setWithdrawalLimitPublisher(
          withdrawalLimitPublisher,
          { from: owner }
        )
      })

      it('sets the withdrawal limit publisher', async function () {
        const currentPublisher = await this.collateralManager.withdrawalLimitPublisher()

        assert.equal(currentPublisher, withdrawalLimitPublisher)
      })

      it('emits an event', async function () {
        const logs = await this.collateralManager.getPastEvents()
        const event = logs[0];

        assert.equal(event.event, EVENT_WITHDRAWAL_LIMIT_PUBLISHER_UPDATE)
        assert.equal(event.args.oldValue, ZERO_ADDRESS)
        assert.equal(event.args.newValue, withdrawalLimitPublisher)
      })
    })

    describe('when non-owner sets the withdrawal limit publisher', () => {
      it('reverts', async function () {
        await shouldFail.reverting(
          this.collateralManager.setWithdrawalLimitPublisher(
            unknown,
            { from: unknown }
          )
        )
      })
    })
  })
})

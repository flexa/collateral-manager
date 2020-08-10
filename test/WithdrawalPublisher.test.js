import { shouldFail } from 'openzeppelin-test-helpers'
import { Constants } from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { ZERO_ADDRESS, EVENT_WITHDRAWAL_PUBLISHER_UPDATE } = Constants

contract('FlexaCollateralManager', function ([
  owner,
  withdrawalPublisher,
  unknown,
]) {
  describe('Withdrawal Publisher', () => {
    beforeEach(async function () {
      this.amp = await MockAmp.deployed()
      this.collateralManager = await FlexaCollateralManager.new(
        this.amp.address,
        { from: owner }
      )
    })

    it('sets the initial withdrawal publisher to the zero address', async function () {
      const currentPublisher = await this.collateralManager.withdrawalPublisher()

      assert.equal(currentPublisher, ZERO_ADDRESS)
    })

    describe('when owner sets the withdrawal publisher', () => {
      beforeEach(async function () {
        await this.collateralManager.setWithdrawalPublisher(
          withdrawalPublisher,
          { from: owner }
        )
      })

      it('sets the withdrawal publisher', async function () {
        const currentPublisher = await this.collateralManager.withdrawalPublisher()

        assert.equal(currentPublisher, withdrawalPublisher)
      })

      it('emits an event', async function () {
        const logs = await this.collateralManager.getPastEvents()
        const event = logs[0]

        assert.equal(event.event, EVENT_WITHDRAWAL_PUBLISHER_UPDATE)
        assert.equal(event.args.oldValue, ZERO_ADDRESS)
        assert.equal(event.args.newValue, withdrawalPublisher)
      })
    })

    describe('when non-owner sets the withdrawal publisher', () => {
      it('reverts', async function () {
        await shouldFail.reverting(
          this.collateralManager.setWithdrawalPublisher(
            unknown,
            { from: unknown }
          )
        )
      })
    })
  })
})

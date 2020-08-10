import { shouldFail } from 'openzeppelin-test-helpers'
import { Constants } from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { ZERO_ADDRESS, EVENT_FALLBACK_PUBLISHER_UPDATE } = Constants

contract('FlexaCollateralManager', function ([
    owner,
    fallbackPublisher,
    unknown,
]) {
    describe('Fallback Publisher', () => {
        beforeEach(async function () {
            this.amp = await MockAmp.deployed()
            this.collateralManager = await FlexaCollateralManager.new(
                this.amp.address,
                { from: owner }
            )
        })

        it('sets the initial fallback publisher to the zero address', async function () {
            const currentPublisher = await this.collateralManager.fallbackPublisher()

            assert.equal(currentPublisher, ZERO_ADDRESS)
        })

        describe('when owner sets the fallback publisher', () => {
            beforeEach(async function () {
                await this.collateralManager.setFallbackPublisher(
                    fallbackPublisher,
                    { from: owner }
                )
            })

            it('sets the fallback publisher', async function () {
                const currentPublisher = await this.collateralManager.fallbackPublisher()

                assert.equal(currentPublisher, fallbackPublisher)
            })

            it('emits an event', async function () {
                const logs = await this.collateralManager.getPastEvents()
                const event = logs[0]

                assert.equal(event.event, EVENT_FALLBACK_PUBLISHER_UPDATE)
                assert.equal(event.args.oldValue, ZERO_ADDRESS)
                assert.equal(event.args.newValue, fallbackPublisher)
            })
        })

        describe('when non-owner sets the fallback publisher', () => {
            it('reverts', async function () {
                await shouldFail.reverting(
                    this.collateralManager.setFallbackPublisher(
                        unknown,
                        { from: unknown }
                    )
                )
            })
        })
    })
})

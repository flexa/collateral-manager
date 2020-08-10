import { Constants, Helpers } from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { ZERO_ADDRESS, EVENT_CONSUMER_UPDATE } = Constants
const { assertRevertErrMsg } = Helpers

contract('FlexaCollateralManager', function ([
    owner,
    consumer,
    unknown,
]) {
    describe('Consumer', () => {
        beforeEach(async function () {
            this.amp = await MockAmp.deployed()
            this.collateralManager = await FlexaCollateralManager.new(
                this.amp.address,
                { from: owner }
            )
        })

        it('sets the initial consumer publisher to the zero address', async function () {
            const currentPublisher = await this.collateralManager.consumer()

            assert.equal(currentPublisher, ZERO_ADDRESS)
        })

        describe('when owner sets the consumer publisher', () => {
            beforeEach(async function () {
                await this.collateralManager.setConsumer(
                    consumer,
                    { from: owner }
                )
            })

            it('sets the consumer publisher', async function () {
                const currentPublisher = await this.collateralManager.consumer()

                assert.equal(currentPublisher, consumer)
            })

            it('emits an event', async function () {
                const logs = await this.collateralManager.getPastEvents()
                const event = logs[0]

                assert.equal(event.event, EVENT_CONSUMER_UPDATE)
                assert.equal(event.args.oldValue, ZERO_ADDRESS)
                assert.equal(event.args.newValue, consumer)
            })
        })

        describe('when non-owner sets the consumer publisher', () => {
            it('reverts', async function () {
                await assertRevertErrMsg(
                    this.collateralManager.setConsumer(
                        unknown,
                        { from: unknown }
                    ),
                    'Invalid sender'
                )
            })
        })
    })
})

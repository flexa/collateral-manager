import { shouldFail } from 'openzeppelin-test-helpers'
import { Constants } from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { ZERO_ADDRESS, EVENT_DIRECT_TRANSFERER_UPDATE } = Constants

contract('FlexaCollateralManager', function ([
    owner,
    directTransferer,
    unknown,
]) {
    describe('DirectTransferer', () => {
        beforeEach(async function () {
            this.amp = await MockAmp.deployed()
            this.collateralManager = await FlexaCollateralManager.new(
                this.amp.address,
                { from: owner }
            )
        })

        it('sets the initial direct transferer to the zero address', async function () {
            const currentPublisher = await this.collateralManager.directTransferer()

            assert.equal(currentPublisher, ZERO_ADDRESS)
        })

        describe('when owner sets the direct transferer', () => {
            beforeEach(async function () {
                await this.collateralManager.setDirectTransferer(
                    directTransferer,
                    { from: owner }
                )
            })

            it('sets the direct transferer publisher', async function () {
                const currentPublisher = await this.collateralManager.directTransferer()

                assert.equal(currentPublisher, directTransferer)
            })

            it('emits an event', async function () {
                const logs = await this.collateralManager.getPastEvents()
                const event = logs[0]

                assert.equal(event.event, EVENT_DIRECT_TRANSFERER_UPDATE)
                assert.equal(event.args.oldValue, ZERO_ADDRESS)
                assert.equal(event.args.newValue, directTransferer)
            })
        })

        describe('when non-owner sets the direct transferer', () => {
            it('reverts', async function () {
                await shouldFail.reverting(
                    this.collateralManager.setDirectTransferer(
                        unknown,
                        { from: unknown }
                    )
                )
            })
        })
    })
})

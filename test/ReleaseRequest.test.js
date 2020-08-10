import { Constants } from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { ALT_PARTITION_1, EVENT_RELEASE_REQUEST } = Constants

const requestAmount = 500

contract('FlexaCollateralManager', function ([
    owner,
    supplier
]) {
    describe('Release Request', () => {
        beforeEach(async function () {
            this.amp = await MockAmp.deployed()
            this.collateralManager = await FlexaCollateralManager.new(
                this.amp.address,
                { from: owner }
            )
        })

        describe('when a supplier requests a release', () => {
            beforeEach(async function () {
                await this.collateralManager.requestRelease(
                    ALT_PARTITION_1,
                    requestAmount,
                    { from: supplier }
                )
            })

            it('emits an event', async function () {
                const logs = await this.collateralManager.getPastEvents()
                const event = logs[0]

                assert.equal(event.event, EVENT_RELEASE_REQUEST)
                assert.equal(event.args.supplier, supplier)
                assert.equal(event.args.partition, ALT_PARTITION_1)
                assert.equal(event.args.amount.toNumber(), requestAmount)
            })
        })
    })
})

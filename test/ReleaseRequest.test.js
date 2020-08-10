import { Constants } from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { ALT_PARTITION_1, ALT_PARTITION_2, EVENT_RELEASE_REQUEST } = Constants

const requestAmount = 500
const data = web3.eth.abi.encodeParameters(
    ['bytes32', 'uint256'],
    [ALT_PARTITION_2, requestAmount],
);

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
                    data,
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
                assert.equal(event.args.data, data)
            })
        })
    })
})

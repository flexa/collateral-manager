import { Constants, Helpers } from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { ZERO_ADDRESS, EVENT_PARTITION_MANAGER_UPDATE } = Constants
const { assertRevertErrMsg } = Helpers

contract('FlexaCollateralManager', function ([
    owner,
    partitionManager,
    unknown,
]) {
    describe('Partition Manager', () => {
        beforeEach(async function () {
            this.amp = await MockAmp.deployed()
            this.collateralManager = await FlexaCollateralManager.new(
                this.amp.address,
                { from: owner }
            )
        })

        it('sets the initial partition manager to the zero address', async function () {
            const currentManager = await this.collateralManager.partitionManager()

            assert.equal(currentManager, ZERO_ADDRESS)
        })

        describe('when owner sets the partition manager', () => {
            beforeEach(async function () {
                await this.collateralManager.setPartitionManager(
                    partitionManager,
                    { from: owner }
                )
            })

            it('sets the partition manager', async function () {
                const currentManager = await this.collateralManager.partitionManager()

                assert.equal(currentManager, partitionManager)
            })

            it('emits an event', async function () {
                const logs = await this.collateralManager.getPastEvents()
                const event = logs[0];

                assert.equal(event.event, EVENT_PARTITION_MANAGER_UPDATE)
                assert.equal(event.args.oldValue, ZERO_ADDRESS)
                assert.equal(event.args.newValue, partitionManager)
            })
        })

        describe('when non-owner sets the partition manager', () => {
            it('reverts', async function () {
                await assertRevertErrMsg(
                    this.collateralManager.setPartitionManager(
                        unknown,
                        { from: unknown }
                    ),
                    'Invalid sender'
                )
            })
        })
    })
})

import { shouldFail } from 'openzeppelin-test-helpers'
import { padRight, toHex } from 'web3-utils'
import { Constants, Helpers } from '../utils'

const MockFXC = artifacts.require('MockFXC')
const Amp = artifacts.require('Amp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const {
    ZERO_ADDRESS,
    ZERO_BYTES4,
    EVENT_PARTITION_ADDED,
    EVENT_PARTITION_REMOVED
} = Constants
const { concatHexData, formatCollateralPartition } = Helpers

contract('FlexaCollateralManager', function ([
    fxcOwner,
    ampOwner,
    owner,
    partitionManager,
    unknown,
]) {
    describe('Integration - Permitted Partitions', () => {
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
            await this.collateralManager.setPartitionManager(
                partitionManager,
                { from: owner }
            )

            this.partitionA = formatCollateralPartition(
                this.collateralManager.address,
                'A',
            )
        })

        it('defaults to unpermitted', async function () {
            const allowed = await this.collateralManager.partitions(this.partitionA)

            assert.equal(allowed, false)
        })

        var allowedRoles = [
            { name: 'owner', address: owner },
            { name: 'partition manager', address: partitionManager }
        ]

        allowedRoles.forEach(function (role) {
            describe('when the ' + role.name + ' adds a partition', () => {
                beforeEach(async function () {
                    await this.collateralManager.addPartition(
                        this.partitionA,
                        { from: role.address }
                    )
                })

                it('adds the partition to the permitted set', async function () {
                    const allowed = await this.collateralManager.partitions(this.partitionA)

                    assert.equal(allowed, true)
                })

                it('emits an event', async function () {
                    const logs = await this.collateralManager.getPastEvents()
                    const event = logs[0]

                    assert.equal(event.event, EVENT_PARTITION_ADDED)
                    assert.equal(event.args.partition, this.partitionA)
                })

                describe('when adding the same partition twice', () => {
                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.collateralManager.addPartition(
                                this.partitionA,
                                { from: role.address }
                            )
                        )
                    })
                })

                describe('when adding a paritition with an invalid prefix', () => {
                    beforeEach(async function () {
                        this.partitionA = concatHexData(
                            ZERO_BYTES4,
                            padRight(toHex('A'), 16),
                            this.collateralManager.address
                        )
                    })

                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.collateralManager.addPartition(
                                this.partitionA,
                                { from: role.address }
                            )
                        )
                    })
                })

                describe('when adding a paritition with invalid address', () => {
                    beforeEach(async function () {
                        this.partitionA = formatCollateralPartition(
                            ZERO_ADDRESS,
                            'A',
                        )
                    })

                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.collateralManager.addPartition(
                                this.partitionA,
                                { from: role.address }
                            )
                        )
                    })
                })

                describe('when the ' + role.name + ' removes the partition', () => {
                    beforeEach(async function () {
                        await this.collateralManager.removePartition(
                            this.partitionA,
                            { from: role.address }
                        )
                    })

                    it('removes the partition to the permitted set', async function () {
                        const allowed = await this.collateralManager.partitions(this.partitionA)

                        assert.equal(allowed, false)
                    })

                    it('emits an event', async function () {
                        const logs = await this.collateralManager.getPastEvents()
                        const event = logs[0]

                        assert.equal(event.event, EVENT_PARTITION_REMOVED)
                        assert.equal(event.args.partition, this.partitionA)
                    })

                    describe('when removing the same partition twice', () => {
                        it('reverts', async function () {
                            await shouldFail.reverting(
                                this.collateralManager.removePartition(
                                    this.partitionA,
                                    { from: role.address }
                                )
                            )
                        })
                    })
                })
            })
        })

        describe('when an unauthorized user adds a partition', () => {
            it('reverts', async function () {
                await shouldFail.reverting(
                    this.collateralManager.addPartition(
                        this.partitionA,
                        { from: unknown }
                    )
                )
            })
        })

        describe('when an unauthorized user removes a partition', () => {
            it('reverts', async function () {
                await shouldFail.reverting(
                    this.collateralManager.removePartition(
                        this.partitionA,
                        { from: unknown }
                    )
                )
            })
        })
    })
})

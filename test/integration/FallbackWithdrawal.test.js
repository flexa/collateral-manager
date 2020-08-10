import { shouldFail } from 'openzeppelin-test-helpers'
import { Constants, Helpers } from '../utils'

const MockFXC = artifacts.require('MockFXC')
const Amp = artifacts.require('Amp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const CollateralPoolPartitionValidator = artifacts.require('CollateralPoolPartitionValidator')
const {
    ZERO_BYTE,
    FLAG_WITHDRAWAL_FALLBACK,
    FLAG_CHANGE_PARTITION,
    DEFAULT_PARTITION,
    SWITCH_TO_DEFAULT_PARTITION,
    PREFIX_COLLATERAL_POOL,
    EVENT_FALLBACK_WITHDRAWAL,
} = Constants
const {
    buildTree,
    concatHexData,
    formatCollateralPartition,
    generateFallbackLeaves,
    generateFallbackOperatorData,
    moveTimeForwardSeconds
} = Helpers

const supplyAmount = 10000
const withdrawAmount = 100
const maxCumulativeWithdrawalAmount = 200
const withdrawalRootNonce = 1

contract('Integration - FlexaCollateralManager', function ([
    fxcOwner,
    ampOwner,
    owner,
    fallbackPublisher,
    supplier,
    unknown,
]) {
    describe('Fallback Withdrawals', function () {
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
            this.validator = await CollateralPoolPartitionValidator.new(
                this.amp.address,
                { from: ampOwner }
            )

            await this.amp.setPartitionStrategy(
                PREFIX_COLLATERAL_POOL,
                this.validator.address,
                { from: ampOwner }
            )

            this.collateralManager = await FlexaCollateralManager.new(
                this.amp.address,
                { from: owner }
            )
            await this.collateralManager.setFallbackPublisher(
                fallbackPublisher,
                { from: owner }
            )

            this.partitionA = formatCollateralPartition(
                this.collateralManager.address,
                'A',
            )
            this.switchToPartitionA = concatHexData(
                FLAG_CHANGE_PARTITION,
                this.partitionA
            )
            this.partitionB = formatCollateralPartition(
                this.collateralManager.address,
                'B',
            )
            this.switchToPartitionB = concatHexData(
                FLAG_CHANGE_PARTITION,
                this.partitionB
            )

            await this.collateralManager.addPartition(
                this.partitionA,
                { from: owner }
            )
            await this.collateralManager.addPartition(
                this.partitionB,
                { from: owner }
            )

            await this.fxc.mint(
                supplier,
                supplyAmount,
                { from: fxcOwner }
            )
            await this.fxc.approve(
                this.amp.address,
                supplyAmount,
                { from: supplier }
            )
            await this.amp.swap(
                supplier,
                { from: supplier }
            )

            await this.amp.transferByPartition(
                DEFAULT_PARTITION, // _partition,
                supplier, // _from,
                this.collateralManager.address, // _to,
                supplyAmount / 2, // _value,
                this.switchToPartitionA, // calldata _data,
                ZERO_BYTE, // calldata _operatorData
                { from: supplier }
            )

            await this.amp.transferByPartition(
                DEFAULT_PARTITION, // _partition,
                supplier, // _from,
                this.collateralManager.address, // _to,
                supplyAmount / 2, // _value,
                this.switchToPartitionB, // calldata _data,
                ZERO_BYTE, // calldata _operatorData
                { from: supplier }
            )

            await this.collateralManager.addWithdrawalRoot(
                '0xb152eca4364850f3424c7ac2b337d606c5ca0a3f96f1554f8db33d2f6f130bbe',
                withdrawalRootNonce,
                [],
                { from: owner }
            )
        })

        describe('when the supplier is authorized to withdraw', () => {
            beforeEach(async function () {
                const leafData = [
                    {
                        to: supplier,
                        partition: this.partitionA,
                        value: maxCumulativeWithdrawalAmount,
                    },
                    // Random leaf
                    {
                        to: '0xd71dbee733fd0e064627e43abd73817838080bb9',
                        partition:
                            '0x56be197ba3650f0a8cf13031b3ac0b7001bd7c981fa09ec4ef9d0b400943c710',
                        value: 74,
                    },
                ]
                const leaves = generateFallbackLeaves(leafData)
                const tree = buildTree(leaves)
                this.proof = tree.getHexProof(leaves[0])

                this.operatorData = generateFallbackOperatorData(
                    FLAG_WITHDRAWAL_FALLBACK,
                    supplier,
                    maxCumulativeWithdrawalAmount,
                    this.proof
                )

                await this.collateralManager.setFallbackRoot(
                    tree.getRoot(),
                    0,
                    { from: fallbackPublisher }
                )
            })

            describe('when the fallback period is active', () => {
                beforeEach(async function () {
                    await this.collateralManager.setFallbackWithdrawalDelay(
                        1,
                        { from: owner }
                    )

                    await moveTimeForwardSeconds(2)
                })

                describe('when the supplier withdraws half of the authorized amount', () => {
                    beforeEach(async function () {
                        await this.amp.transferByPartition(
                            this.partitionA, // _partition,
                            this.collateralManager.address, // _from,
                            supplier, // _to,
                            withdrawAmount, // _value,
                            SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                            this.operatorData, // calldata _operatorData
                            { from: supplier }
                        )
                    })

                    it('emits an event', async function () {
                        const logs = await this.collateralManager.getPastEvents()
                        const event = logs[0]

                        assert.equal(event.event, EVENT_FALLBACK_WITHDRAWAL)
                        assert.equal(event.args.supplier, supplier)
                        assert.equal(event.args.partition, this.partitionA)
                        assert.equal(event.args.amount, withdrawAmount)
                    })

                    it('updates the cumulative amount withdrawn', async function () {
                        const cumulativeAmountWithdrawn =
                            await this.collateralManager.addressToCumulativeAmountWithdrawn(
                                this.partitionA,
                                supplier
                            )

                        assert.equal(cumulativeAmountWithdrawn, withdrawAmount)
                    })

                    it('invalidates withdrawals', async function () {
                        const supplierWithdrawalNonce = await this.collateralManager.
                            addressToWithdrawalNonce(
                                this.partitionA,
                                supplier
                            )

                        assert.equal(supplierWithdrawalNonce, withdrawalRootNonce)
                    })

                    describe('when the supplier withdraws the second half of the authorized amount', () => {
                        beforeEach(async function () {
                            await this.amp.transferByPartition(
                                this.partitionA, // _partition,
                                this.collateralManager.address, // _from,
                                supplier, // _to,
                                withdrawAmount, // _value,
                                SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                                this.operatorData, // calldata _operatorData
                                { from: supplier }
                            )
                        })

                        it('emits an event', async function () {
                            const logs = await this.collateralManager.getPastEvents()
                            const event = logs[0]

                            assert.equal(event.event, EVENT_FALLBACK_WITHDRAWAL)
                            assert.equal(event.args.supplier, supplier)
                            assert.equal(event.args.partition, this.partitionA)
                            assert.equal(event.args.amount, withdrawAmount)
                        })

                        it('updates the cumulative amount withdrawn', async function () {
                            const cumulativeAmountWithdrawn =
                                await this.collateralManager.addressToCumulativeAmountWithdrawn(
                                    this.partitionA,
                                    supplier
                                )

                            assert.equal(cumulativeAmountWithdrawn, withdrawAmount * 2)
                        })

                        describe('when the supplier exceeds max allowed fallback withdrawal', () => {
                            it('reverts', async function () {
                                await shouldFail.reverting(
                                    this.amp.transferByPartition(
                                        this.partitionA, // _partition,
                                        this.collateralManager.address, // _from,
                                        supplier, // _to,
                                        withdrawAmount, // _value,
                                        SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                                        this.operatorData, // calldata _operatorData
                                        { from: supplier }
                                    )
                                )
                            })
                        })
                    })
                })

                describe('when the owner withdraws', () => {
                    beforeEach(async function () {
                        await this.amp.transferByPartition(
                            this.partitionA, // _partition,
                            this.collateralManager.address, // _from,
                            owner, // _to,
                            withdrawAmount, // _value,
                            SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                            this.operatorData, // calldata _operatorData
                            { from: owner }
                        )
                    })

                    it('records the supplier as the withdrawer in the event', async function () {
                        const logs = await this.collateralManager.getPastEvents()
                        const event = logs[0]

                        assert.equal(event.event, EVENT_FALLBACK_WITHDRAWAL)
                        assert.equal(event.args.supplier, supplier)
                        assert.equal(event.args.partition, this.partitionA)
                        assert.equal(event.args.amount, withdrawAmount)
                    })
                })

                describe('when the fallback publisher executes the fallback withdrawal', () => {
                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.transferByPartition(
                                this.partitionA, // _partition,
                                this.collateralManager.address, // _from,
                                fallbackPublisher, // _to,
                                withdrawAmount, // _value,
                                SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                                this.operatorData, // calldata _operatorData
                                { from: fallbackPublisher }
                            )
                        )
                    })
                })

                describe('when an unauthorized user executes the fallback withdrawal', () => {
                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.transferByPartition(
                                this.partitionA, // _partition,
                                this.collateralManager.address, // _from,
                                unknown, // _to,
                                withdrawAmount, // _value,
                                SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                                this.operatorData, // calldata _operatorData
                                { from: unknown }
                            )
                        )
                    })
                })


                describe('when the supplier provides an incorrect proof', () => {
                    beforeEach(async function () {
                        const leafData = [
                            {
                                to: supplier,
                                partition: this.partitionA,
                                value: withdrawAmount,
                            },
                            // Random leaf
                            {
                                to: '0xd71dbee733fd0e064627e43abd73817838080bb9',
                                partition:
                                    '0x56be197ba3650f0a8cf13031b3ac0b7001bd7c981fa09ec4ef9d0b400943c710',
                                value: 76,
                            },
                        ]
                        const leaves = generateFallbackLeaves(leafData)
                        const tree = buildTree(leaves)
                        this.proof = tree.getHexProof(leaves[0])

                        this.operatorData = generateFallbackOperatorData(
                            FLAG_WITHDRAWAL_FALLBACK,
                            supplier,
                            maxCumulativeWithdrawalAmount,
                            this.proof
                        )
                    })

                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.transferByPartition(
                                this.partitionA, // _partition,
                                this.collateralManager.address, // _from,
                                supplier, // _to,
                                withdrawAmount, // _value,
                                SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                                this.operatorData, // calldata _operatorData
                                { from: supplier }
                            )
                        )
                    })
                })

                describe('when the supplier provides an incorrect partition', () => {
                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.transferByPartition(
                                this.partitionB, // _partition,
                                this.collateralManager.address, // _from,
                                supplier, // _to,
                                withdrawAmount, // _value,
                                SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                                this.operatorData, // calldata _operatorData
                                { from: supplier }
                            )
                        )
                    })
                })

                describe('when the supplier provides an incorrect max cumulative amount', () => {
                    beforeEach(async function () {
                        const leafData = [
                            {
                                to: supplier,
                                partition: this.partitionA,
                                value: maxCumulativeWithdrawalAmount,
                            },
                            // Random leaf
                            {
                                to: '0xd71dbee733fd0e064627e43abd73817838080bb9',
                                partition:
                                    '0x56be197ba3650f0a8cf13031b3ac0b7001bd7c981fa09ec4ef9d0b400943c710',
                                value: 76,
                            },
                        ]
                        const leaves = generateFallbackLeaves(leafData)
                        const tree = buildTree(leaves)
                        this.proof = tree.getHexProof(leaves[0])

                        this.operatorData = generateFallbackOperatorData(
                            FLAG_WITHDRAWAL_FALLBACK,
                            supplier,
                            maxCumulativeWithdrawalAmount + 1,
                            this.proof
                        )
                    })

                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.transferByPartition(
                                this.partitionA, // _partition,
                                this.collateralManager.address, // _from,
                                supplier, // _to,
                                withdrawAmount, // _value,
                                SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                                this.operatorData, // calldata _operatorData
                                { from: supplier }
                            )
                        )
                    })
                })
            })
        })
    })
})

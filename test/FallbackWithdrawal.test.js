import { Constants, Helpers } from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const {
    ZERO_BYTES4,
    FLAG_WITHDRAWAL_FALLBACK,
    DEFAULT_PARTITION,
    ALT_PARTITION_1,
    SWITCH_TO_DEFAULT_PARTITION,
    EVENT_FALLBACK_WITHDRAWAL
} = Constants
const {
    assertRevertErrMsg,
    buildTree,
    generateFallbackLeaves,
    generateFallbackOperatorData,
    moveTimeForwardSeconds,
} = Helpers

const withdrawAmount = 100
const maxCumulativeWithdrawalAmount = 200
const withdrawalRootNonce = 1

contract('FlexaCollateralManager', function ([
    owner,
    fallbackPublisher,
    supplier,
    unknown,
]) {
    describe('Fallback Withdrawals', function () {
        beforeEach(async function () {
            this.amp = await MockAmp.deployed()
            this.collateralManager = await FlexaCollateralManager.new(
                this.amp.address,
                { from: owner }
            )
            await this.collateralManager.setFallbackPublisher(
                fallbackPublisher,
                { from: owner }
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
                        partition: ALT_PARTITION_1,
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
                        await this.amp.tokensToTransfer(
                            ZERO_BYTES4, // _functionSig
                            ALT_PARTITION_1, // _partition
                            supplier, // _operator
                            this.collateralManager.address, // _from
                            supplier, // to
                            withdrawAmount, // _value
                            SWITCH_TO_DEFAULT_PARTITION, // data
                            this.operatorData, // _operatorData
                            { from: supplier }
                        )
                    })

                    it('emits an event', async function () {
                        const logs = await this.collateralManager.getPastEvents()
                        const event = logs[0]

                        assert.equal(event.event, EVENT_FALLBACK_WITHDRAWAL)
                        assert.equal(event.args.supplier, supplier)
                        assert.equal(event.args.partition, ALT_PARTITION_1)
                        assert.equal(event.args.amount, withdrawAmount)
                    })

                    it('updates the cumulative amount withdrawn', async function () {
                        const cumulativeAmountWithdrawn =
                            await this.collateralManager.addressToCumulativeAmountWithdrawn(
                                ALT_PARTITION_1,
                                supplier
                            )

                        assert.equal(cumulativeAmountWithdrawn, withdrawAmount)
                    })

                    it('invalidates withdrawals', async function () {
                        const supplierWithdrawalNonce = await this.collateralManager.
                            addressToWithdrawalNonce(
                                ALT_PARTITION_1,
                                supplier
                            )

                        assert.equal(supplierWithdrawalNonce, withdrawalRootNonce)
                    })

                    describe('when the supplier withdraws the second half of the authorized amount', () => {
                        beforeEach(async function () {
                            await this.amp.tokensToTransfer(
                                ZERO_BYTES4, // _functionSig
                                ALT_PARTITION_1, // _partition
                                supplier, // _operator
                                this.collateralManager.address, // _from
                                supplier, // to
                                withdrawAmount, // _value
                                SWITCH_TO_DEFAULT_PARTITION, // data
                                this.operatorData, // _operatorData
                                { from: supplier }
                            )
                        })

                        it('emits an event', async function () {
                            const logs = await this.collateralManager.getPastEvents()
                            const event = logs[0]

                            assert.equal(event.event, EVENT_FALLBACK_WITHDRAWAL)
                            assert.equal(event.args.supplier, supplier)
                            assert.equal(event.args.partition, ALT_PARTITION_1)
                            assert.equal(event.args.amount, withdrawAmount)
                        })

                        it('updates the cumulative amount withdrawn', async function () {
                            const cumulativeAmountWithdrawn =
                                await this.collateralManager.addressToCumulativeAmountWithdrawn(
                                    ALT_PARTITION_1,
                                    supplier
                                )

                            assert.equal(cumulativeAmountWithdrawn, withdrawAmount * 2)
                        })

                        describe('when the supplier exceeds max allowed fallback withdrawal', () => {
                            it('reverts', async function () {
                                await assertRevertErrMsg(
                                    this.amp.tokensToTransfer(
                                        ZERO_BYTES4, // _functionSig
                                        ALT_PARTITION_1, // _partition
                                        supplier, // _operator
                                        this.collateralManager.address, // _from
                                        supplier, // to
                                        withdrawAmount, // _value
                                        SWITCH_TO_DEFAULT_PARTITION, // data
                                        this.operatorData, // _operatorData
                                        { from: supplier }
                                    ),
                                    'Transfer unauthorized'
                                )
                            })
                        })
                    })
                })

                describe('when the owner withdraws', () => {
                    it('is allowed', async function () {
                        await this.amp.tokensToTransfer(
                            ZERO_BYTES4, // _functionSig
                            ALT_PARTITION_1, // _partition
                            owner, // _operator
                            this.collateralManager.address, // _from
                            owner, // to
                            withdrawAmount, // _value
                            SWITCH_TO_DEFAULT_PARTITION, // data
                            this.operatorData, // _operatorData
                            { from: owner }
                        )
                    })
                })

                describe('when the fallback publisher executes the fallback withdrawal', () => {
                    it('reverts', async function () {
                        await assertRevertErrMsg(
                            this.amp.tokensToTransfer(
                                ZERO_BYTES4, // _functionSig
                                ALT_PARTITION_1, // _partition
                                fallbackPublisher, // _operator
                                this.collateralManager.address, // _from
                                fallbackPublisher, // to
                                withdrawAmount, // _value
                                SWITCH_TO_DEFAULT_PARTITION, // data
                                this.operatorData, // _operatorData
                                { from: fallbackPublisher }
                            ),
                            'Transfer unauthorized'
                        )
                    })
                })

                describe('when an unauthorized user executes the fallback withdrawal', () => {
                    it('reverts', async function () {
                        await assertRevertErrMsg(
                            this.amp.tokensToTransfer(
                                ZERO_BYTES4, // _functionSig
                                ALT_PARTITION_1, // _partition
                                unknown, // _operator
                                this.collateralManager.address, // _from
                                unknown, // to
                                withdrawAmount, // _value
                                SWITCH_TO_DEFAULT_PARTITION, // data
                                this.operatorData, // _operatorData
                                { from: unknown }
                            ),
                            'Transfer unauthorized'
                        )
                    })
                })


                describe('when the supplier provides an incorrect proof', () => {
                    beforeEach(async function () {
                        const leafData = [
                            {
                                to: supplier,
                                partition: ALT_PARTITION_1,
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
                        await assertRevertErrMsg(
                            this.amp.tokensToTransfer(
                                ZERO_BYTES4, // _functionSig
                                ALT_PARTITION_1, // _partition
                                supplier, // _operator
                                this.collateralManager.address, // _from
                                supplier, // to
                                withdrawAmount, // _value
                                SWITCH_TO_DEFAULT_PARTITION, // data
                                this.operatorData, // _operatorData
                                { from: supplier }
                            ),
                            'Transfer unauthorized'
                        )
                    })
                })

                describe('when the supplier provides an incorrect partition', () => {
                    it('reverts', async function () {
                        await assertRevertErrMsg(
                            this.amp.tokensToTransfer(
                                ZERO_BYTES4, // _functionSig
                                DEFAULT_PARTITION, // _partition
                                supplier, // _operator
                                this.collateralManager.address, // _from
                                supplier, // to
                                withdrawAmount, // _value
                                SWITCH_TO_DEFAULT_PARTITION, // data
                                this.operatorData, // _operatorData
                                { from: supplier }
                            ),
                            'Transfer unauthorized'
                        )
                    })
                })

                describe('when the supplier provides an incorrect max cumulative amount', () => {
                    beforeEach(async function () {
                        const leafData = [
                            {
                                to: supplier,
                                partition: ALT_PARTITION_1,
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
                        await assertRevertErrMsg(
                            this.amp.tokensToTransfer(
                                ZERO_BYTES4, // _functionSig
                                ALT_PARTITION_1, // _partition
                                supplier, // _operator
                                this.collateralManager.address, // _from
                                supplier, // to
                                withdrawAmount, // _value
                                SWITCH_TO_DEFAULT_PARTITION, // data
                                this.operatorData, // _operatorData
                                { from: supplier }
                            ),
                            'Transfer unauthorized'
                        )
                    })
                })
            })
        })
    })
})

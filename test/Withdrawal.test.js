import { shouldFail } from 'openzeppelin-test-helpers'
import { Constants, Helpers } from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { BN } = web3.utils
const {
    FLAG_WITHDRAWAL,
    ZERO_BYTES4,
    DEFAULT_PARTITION,
    ALT_PARTITION_1,
    SWITCH_TO_DEFAULT_PARTITION,
    EVENT_RENOUNCE_WITHDRAWAL_AUTHORIZATION,
    EVENT_WITHDRAWAL
} = Constants
const {
    buildTree,
    generateLeaves,
    generateOperatorData,
} = Helpers

const withdrawAmount = 100
const nonce0 = 0
const rootNonce1 = 1
const rootNonce2 = 2

contract('FlexaCollateralManager', function ([
    owner,
    withdrawalPublisher,
    supplier,
    unknown,
]) {
    describe('Withdrawal', function () {
        beforeEach(async function () {
            this.amp = await MockAmp.deployed()
            this.collateralManager = await FlexaCollateralManager.new(
                this.amp.address,
                { from: owner }
            )
            await this.collateralManager.setWithdrawalPublisher(
                withdrawalPublisher,
                { from: owner }
            )
        })

        describe('when the supplier is authorized to withdraw', () => {
            beforeEach(async function () {
                const leafData = [
                    {
                        to: supplier,
                        partition: ALT_PARTITION_1,
                        value: withdrawAmount,
                        nonce: nonce0,
                    },
                    // Random leaf
                    {
                        to: '0xd71dbee733fd0e064627e43abd73817838080bb9',
                        partition:
                            '0x56be197ba3650f0a8cf13031b3ac0b7001bd7c981fa09ec4ef9d0b400943c710',
                        value: 74,
                        nonce: 123,
                    },
                ]
                const leaves = generateLeaves(leafData)
                const tree = buildTree(leaves)
                this.proof = tree.getHexProof(leaves[0])

                this.operatorData = generateOperatorData(
                    FLAG_WITHDRAWAL,
                    supplier,
                    nonce0,
                    this.proof
                )

                await this.collateralManager.addWithdrawalRoot(
                    tree.getRoot(),
                    rootNonce1,
                    [],
                    { from: withdrawalPublisher }
                )
            })

            describe('when the supplier withdraws', () => {
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

                it('updates the suppliers nonce', async function () {
                    const supplierNonce =
                        await this.collateralManager.addressToWithdrawalNonce(
                            ALT_PARTITION_1,
                            supplier
                        )

                    assert.equal(supplierNonce, rootNonce1)
                })

                it('updates the cumulative amount withdrawn', async function () {
                    const cumulativeAmountWithdrawn =
                        await this.collateralManager.addressToCumulativeAmountWithdrawn(
                            ALT_PARTITION_1,
                            supplier
                        )

                    assert.equal(cumulativeAmountWithdrawn, withdrawAmount)
                })

                it('emits an event', async function () {
                    const logs = await this.collateralManager.getPastEvents()
                    const event = logs[0]

                    assert.equal(event.event, EVENT_WITHDRAWAL)
                    assert.equal(event.args.supplier, supplier)
                    assert.equal(event.args.partition, ALT_PARTITION_1)
                    assert.equal(event.args.amount, withdrawAmount)
                    assert.equal(event.args.rootNonce, rootNonce1)
                    assert.equal(event.args.authorizedAccountNonce, nonce0)
                })

                describe('when the supplier reuses valid withdrawal data', () => {
                    it('reverts', async function () {
                        await shouldFail.reverting(
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
                            )
                        )
                    })
                })

                describe('when a second root with the same authorization is added', () => {
                    beforeEach(async function () {
                        const leafData = [
                            {
                                to: supplier,
                                partition: ALT_PARTITION_1,
                                value: withdrawAmount,
                                nonce: nonce0,
                            },
                            // Random leaf
                            {
                                to: '0xd71dbee733fd0e064627e43abd73817838080bb9',
                                partition:
                                    '0x56be197ba3650f0a8cf13031b3ac0b7001bd7c981fa09ec4ef9d0b400943c710',
                                value: 74,
                                nonce: 456,
                            },
                        ]
                        const leaves = generateLeaves(leafData)
                        const tree = buildTree(leaves)
                        const proof = tree.getHexProof(leaves[0])

                        this.operatorData = generateOperatorData(
                            FLAG_WITHDRAWAL,
                            supplier,
                            nonce0,
                            proof
                        )

                        await this.collateralManager.addWithdrawalRoot(
                            tree.getRoot(),
                            rootNonce2,
                            [],
                            { from: withdrawalPublisher }
                        )
                    })

                    describe('when the supplier attempts to use the same authorization on second root', () => {
                        it('reverts', async function () {
                            await shouldFail.reverting(
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
                                )
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

            describe('when the withdrawal publisher withdraws', () => {
                it('is allowed', async function () {
                    await this.amp.tokensToTransfer(
                        ZERO_BYTES4, // _functionSig
                        ALT_PARTITION_1, // _partition
                        withdrawalPublisher, // _operator
                        this.collateralManager.address, // _from
                        withdrawalPublisher, // to
                        withdrawAmount, // _value
                        SWITCH_TO_DEFAULT_PARTITION, // data
                        this.operatorData, // _operatorData
                        { from: withdrawalPublisher }
                    )
                })
            })

            describe('when an unauthorized user withdraws', () => {
                it('reverts', async function () {
                    await shouldFail.reverting(
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
                        )
                    )
                })
            })

            describe('when the supplier provides an incorrect value', () => {
                it('reverts', async function () {
                    await shouldFail.reverting(
                        this.amp.tokensToTransfer(
                            ZERO_BYTES4, // _functionSig
                            ALT_PARTITION_1, // _partition
                            supplier, // _operator
                            this.collateralManager.address, // _from
                            supplier, // to
                            withdrawAmount + 1, // _value
                            SWITCH_TO_DEFAULT_PARTITION, // data
                            this.operatorData, // _operatorData
                            { from: supplier }
                        )
                    )
                })
            })

            describe('when the supplier provides an incorrect nonce', () => {
                beforeEach(async function () {
                    this.operatorData = generateOperatorData(
                        FLAG_WITHDRAWAL,
                        supplier,
                        nonce0 + 1,
                        this.proof
                    )
                })

                it('reverts', async function () {
                    await shouldFail.reverting(
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
                        )
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
                            nonce: nonce0,
                        },
                        // Random leaf
                        {
                            to: '0xd71dbee733fd0e064627e43abd73817838080bb9',
                            partition:
                                '0x56be197ba3650f0a8cf13031b3ac0b7001bd7c981fa09ec4ef9d0b400943c710',
                            value: 74,
                            nonce: 9999,
                        },
                    ]
                    const leaves = generateLeaves(leafData)
                    const tree = buildTree(leaves)
                    this.proof = tree.getHexProof(leaves[0])

                    this.operatorData = generateOperatorData(
                        FLAG_WITHDRAWAL,
                        supplier,
                        nonce0,
                        this.proof
                    )
                })

                it('reverts', async function () {
                    await shouldFail.reverting(
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
                        )
                    )
                })
            })

            describe('when the supplier provides an incorrect partition', () => {
                it('reverts', async function () {
                    await shouldFail.reverting(
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
                        )
                    )
                })
            })

            describe('when the withdrawal exceeds the limit', () => {
                beforeEach(async function () {
                    const limit = await this.collateralManager.withdrawalLimit()
                    const delta = new BN(0).sub(new BN(limit))

                    await this.collateralManager.modifyWithdrawalLimit(
                        delta,
                        { from: owner }
                    )
                })

                it('reverts', async function () {
                    await shouldFail.reverting(
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
                        )
                    )
                })
            })
        })
    })
})

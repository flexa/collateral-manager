import { shouldFail } from 'openzeppelin-test-helpers'
import { Constants, Helpers } from '../utils'

const MockFXC = artifacts.require('MockFXC')
const Amp = artifacts.require('Amp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const CollateralPoolPartitionValidator = artifacts.require('CollateralPoolPartitionValidator')
const { BN } = web3.utils
const {
    ZERO_BYTE,
    FLAG_CHANGE_PARTITION,
    FLAG_WITHDRAWAL,
    DEFAULT_PARTITION,
    SWITCH_TO_DEFAULT_PARTITION,
    PREFIX_COLLATERAL_POOL,
    EVENT_RENOUNCE_WITHDRAWAL_AUTHORIZATION,
    EVENT_WITHDRAWAL,
} = Constants
const {
    buildTree,
    concatHexData,
    formatCollateralPartition,
    generateLeaves,
    generateOperatorData,
} = Helpers

const withdrawAmount = 100
const nonce0 = 0
const rootNonce1 = 1
const rootNonce2 = 2

contract('Integration - FlexaCollateralManager', function ([
    fxcOwner,
    ampOwner,
    owner,
    withdrawalPublisher,
    supplier,
    unknown,
]) {
    describe('Withdrawal', function () {
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

            await this.collateralManager.setWithdrawalPublisher(
                withdrawalPublisher,
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
            await this.collateralManager.addPartition(
                this.partitionA,
                { from: owner }
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
                this.partitionB,
                { from: owner }
            )

            await this.fxc.mint(
                supplier,
                10000,
                { from: fxcOwner }
            )
            await this.fxc.approve(
                this.amp.address,
                10000,
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
                1000, // _value,
                this.switchToPartitionA, // calldata _data,
                ZERO_BYTE, // calldata _operatorData
                { from: supplier }
            )

            await this.amp.transferByPartition(
                DEFAULT_PARTITION, // _partition,
                supplier, // _from,
                this.collateralManager.address, // _to,
                1000, // _value,
                this.switchToPartitionB, // calldata _data,
                ZERO_BYTE, // calldata _operatorData
                { from: supplier }
            )
        })

        describe('when the supplier is authorized to withdraw', () => {
            beforeEach(async function () {
                const leafData = [
                    {
                        to: supplier,
                        partition: this.partitionA,
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

                it('updates the suppliers nonce', async function () {
                    const supplierNonce =
                        await this.collateralManager.addressToWithdrawalNonce(
                            this.partitionA,
                            supplier
                        )

                    assert.equal(supplierNonce, rootNonce1)
                })

                it('updates the cumulative amount withdrawn', async function () {
                    const cumulativeAmountWithdrawn =
                        await this.collateralManager.addressToCumulativeAmountWithdrawn(
                            this.partitionA,
                            supplier
                        )

                    assert.equal(cumulativeAmountWithdrawn, withdrawAmount)
                })

                it('emits an event', async function () {
                    const logs = await this.collateralManager.getPastEvents()
                    const event = logs[0]

                    assert.equal(event.event, EVENT_WITHDRAWAL)
                    assert.equal(event.args.supplier, supplier)
                    assert.equal(event.args.partition, this.partitionA)
                    assert.equal(event.args.amount, withdrawAmount)
                    assert.equal(event.args.rootNonce, rootNonce1)
                    assert.equal(event.args.authorizedAccountNonce, nonce0)
                })

                describe('when the supplier reuses valid withdrawal data', () => {
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

                describe('when a second root with the same authorization is added', () => {
                    beforeEach(async function () {
                        const leafData = [
                            {
                                to: supplier,
                                partition: this.partitionA,
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
                        withdrawalPublisher, // _to,
                        withdrawAmount, // _value,
                        SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                        this.operatorData, // calldata _operatorData
                        { from: withdrawalPublisher }
                    )
                })

                it('updates the suppliers nonce', async function () {
                    const supplierNonce =
                        await this.collateralManager.addressToWithdrawalNonce(
                            this.partitionA,
                            supplier
                        )

                    assert.equal(supplierNonce, rootNonce1)
                })

                it('updates the suppliers cumulative amount withdrawn', async function () {
                    const cumulativeAmountWithdrawn =
                        await this.collateralManager.addressToCumulativeAmountWithdrawn(
                            this.partitionA,
                            supplier
                        )

                    assert.equal(cumulativeAmountWithdrawn, withdrawAmount)
                })

                it('emits an event with the supplier as the withdrawer', async function () {
                    const logs = await this.collateralManager.getPastEvents()
                    const event = logs[0]

                    assert.equal(event.event, EVENT_WITHDRAWAL)
                    assert.equal(event.args.supplier, supplier)
                    assert.equal(event.args.partition, this.partitionA)
                    assert.equal(event.args.amount, withdrawAmount)
                    assert.equal(event.args.rootNonce, rootNonce1)
                    assert.equal(event.args.authorizedAccountNonce, nonce0)
                })
            })

            describe('when the withdrawal publisher withdraws', () => {
                beforeEach(async function () {
                    await this.amp.transferByPartition(
                        this.partitionA, // _partition,
                        this.collateralManager.address, // _from,
                        withdrawalPublisher, // _to,
                        withdrawAmount, // _value,
                        SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                        this.operatorData, // calldata _operatorData
                        { from: withdrawalPublisher }
                    )
                })

                it('updates the suppliers nonce', async function () {
                    const supplierNonce =
                        await this.collateralManager.addressToWithdrawalNonce(
                            this.partitionA,
                            supplier
                        )

                    assert.equal(supplierNonce, rootNonce1)
                })

                it('updates the suppliers cumulative amount withdrawn', async function () {
                    const cumulativeAmountWithdrawn =
                        await this.collateralManager.addressToCumulativeAmountWithdrawn(
                            this.partitionA,
                            supplier
                        )

                    assert.equal(cumulativeAmountWithdrawn, withdrawAmount)
                })

                it('emits an event with the supplier as the withdrawer', async function () {
                    const logs = await this.collateralManager.getPastEvents()
                    const event = logs[0]

                    assert.equal(event.event, EVENT_WITHDRAWAL)
                    assert.equal(event.args.supplier, supplier)
                    assert.equal(event.args.partition, this.partitionA)
                    assert.equal(event.args.amount, withdrawAmount)
                    assert.equal(event.args.rootNonce, rootNonce1)
                    assert.equal(event.args.authorizedAccountNonce, nonce0)
                })
            })

            describe('when an unauthorized user withdraws', () => {
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

            describe('when the supplier provides an incorrect value', () => {
                it('reverts', async function () {
                    await shouldFail.reverting(
                        this.amp.transferByPartition(
                            this.partitionA, // _partition,
                            this.collateralManager.address, // _from,
                            supplier, // _to,
                            withdrawAmount + 1, // _value,
                            SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                            this.operatorData, // calldata _operatorData
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

            describe('when the supplier provides an incorrect proof', () => {
                beforeEach(async function () {
                    const leafData = [
                        {
                            to: supplier,
                            partition: this.partitionA,
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

import { shouldFail } from 'openzeppelin-test-helpers'
import { Constants } from '../utils'

const MockFXC = artifacts.require('MockFXC')
const Amp = artifacts.require('Amp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const {
  ZERO_BYTES32,
  EVENT_WITHDRAWAL_ROOT_HASH_REMOVAL,
  EVENT_WITHDRAWAL_ROOT_HASH_ADDITION
} = Constants

const merkleRoot1 =
  '0xb152eca4364850f3424c7ac2b337d606c5ca0a3f96f1554f8db33d2f6f130bbe'
const merkleRoot2 =
  '0xb252eca4364850f3424c7ac2b337d606c5ca0a3f96f1554f8db33d2f6f130bbe'
const merkleRoot3 =
  '0xB352ECA4364850F3424C7AC2B337D606C5CA0A3F96F1554F8DB33D2F6F130BBE'
const rootNonce1 = 1
const rootNonce2 = 2
const rootNonce3 = 3

contract('Integration - FlexaCollateralManager', function ([
  fxcOwner,
  ampOwner,
  owner,
  withdrawalPublisher,
  unknown
]) {
  describe('Withdrawal Roots', () => {
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
      await this.collateralManager.setWithdrawalPublisher(
        withdrawalPublisher,
        { from: owner }
      )
    })

    it('sets a default max withdrawal root nonce of zero', async function () {
      const maxNonce = await this.collateralManager.maxWithdrawalRootNonce()

      assert.equal(maxNonce, 0)
    })

    describe('when owner adds a root', () => {
      beforeEach(async function () {
        await this.collateralManager.addWithdrawalRoot(
          merkleRoot1,
          rootNonce1,
          [],
          { from: owner }
        )
      })

      it('sets the max withdrawal root nonce', async function () {
        const maxNonce = await this.collateralManager.maxWithdrawalRootNonce()

        assert.equal(maxNonce, rootNonce1)
      })

      it('adds the root to the active set', async function () {
        const rootNonce = await this.collateralManager.withdrawalRootToNonce(merkleRoot1)

        assert.equal(rootNonce1, rootNonce)
      })

      it('emits an addition event', async function () {
        const logs = await this.collateralManager.getPastEvents()
        const event = logs[0];

        assert.equal(event.event, EVENT_WITHDRAWAL_ROOT_HASH_ADDITION)
        assert.equal(event.args.rootHash, merkleRoot1)
        assert.equal(event.args.nonce, rootNonce1)
      })

      describe('when adding identical root with next nonce', () => {
        it('reverts', async function () {
          await shouldFail.reverting(
            this.collateralManager.addWithdrawalRoot(
              merkleRoot1,
              rootNonce2,
              [],
              { from: owner }
            )
          )
        })
      })

      describe('when adding different root with existing nonce', () => {
        it('reverts', async function () {
          await shouldFail.reverting(
            this.collateralManager.addWithdrawalRoot(
              merkleRoot2,
              rootNonce1,
              [],
              { from: owner }
            )
          )
        })
      })

      describe('when adding different root with future nonce', () => {
        it('reverts', async function () {
          await shouldFail.reverting(
            this.collateralManager.addWithdrawalRoot(
              merkleRoot2,
              rootNonce3,
              [],
              { from: owner }
            )
          )
        })
      })
    })

    describe('when owner adds multiple roots', () => {
      beforeEach(async function () {
        await this.collateralManager.addWithdrawalRoot(
          merkleRoot1,
          rootNonce1,
          [],
          { from: owner }
        )
        await this.collateralManager.addWithdrawalRoot(
          merkleRoot2,
          rootNonce2,
          [],
          { from: owner }
        )
      })

      describe('when owner adds root with deletions', () => {
        beforeEach(async function () {
          await this.collateralManager.addWithdrawalRoot(
            merkleRoot3,
            rootNonce3,
            [merkleRoot1, merkleRoot2],
            { from: owner }
          )
        })

        it('removes roots from the active set', async function () {
          const removedRootNonce1 = await this.collateralManager.withdrawalRootToNonce(merkleRoot1)
          const removedRootNonce2 = await this.collateralManager.withdrawalRootToNonce(merkleRoot1)

          assert.equal(0, removedRootNonce1)
          assert.equal(0, removedRootNonce2)
        })

        it('emits removal events', async function () {
          const logs = await this.collateralManager.getPastEvents()

          // NB: logs[0] is the Addition event
          let event = logs[1];
          assert.equal(event.event, EVENT_WITHDRAWAL_ROOT_HASH_REMOVAL)
          assert.equal(event.args.rootHash, merkleRoot1)
          assert.equal(event.args.nonce, rootNonce1)

          event = logs[2];
          assert.equal(event.event, EVENT_WITHDRAWAL_ROOT_HASH_REMOVAL)
          assert.equal(event.args.rootHash, merkleRoot2)
          assert.equal(event.args.nonce, rootNonce2)
        })

        it('sets the max withdrawal root nonce', async function () {
          const maxNonce = await this.collateralManager.maxWithdrawalRootNonce()

          assert.equal(maxNonce, rootNonce3)
        })
      })

      describe('when the owner deletes roots', () => {
        beforeEach(async function () {
          await this.collateralManager.removeWithdrawalRoots(
            [merkleRoot1, merkleRoot2],
            { from: owner }
          )
        })

        it('removes the roots from the active set', async function () {
          const removedRootNonce1 = await this.collateralManager.withdrawalRootToNonce(merkleRoot1)
          const removedRootNonce2 = await this.collateralManager.withdrawalRootToNonce(merkleRoot1)

          assert.equal(0, removedRootNonce1)
          assert.equal(0, removedRootNonce2)
        })

        it('emits removal events', async function () {
          const logs = await this.collateralManager.getPastEvents()

          let event = logs[0];
          assert.equal(event.event, EVENT_WITHDRAWAL_ROOT_HASH_REMOVAL)
          assert.equal(event.args.rootHash, merkleRoot1)
          assert.equal(event.args.nonce, rootNonce1)

          event = logs[1];
          assert.equal(event.event, EVENT_WITHDRAWAL_ROOT_HASH_REMOVAL)
          assert.equal(event.args.rootHash, merkleRoot2)
          assert.equal(event.args.nonce, rootNonce2)
        })

        it('does not affect the max withdrawal root nonce', async function () {
          const maxNonce = await this.collateralManager.maxWithdrawalRootNonce()

          assert.equal(maxNonce, rootNonce2)
        })
      })

      describe('when the withdrawal publisher deletes roots', () => {
        it('is allowed', async function () {
          await this.collateralManager.removeWithdrawalRoots(
            [merkleRoot1, merkleRoot2],
            { from: withdrawalPublisher }
          )
        })
      })

      describe('when an unauthorized user deletes roots', () => {
        it('reverts', async function () {
          await shouldFail.reverting(
            this.collateralManager.removeWithdrawalRoots(
              [merkleRoot1, merkleRoot2],
              { from: unknown }
            )
          )
        })
      })
    })

    describe('when owner adds the zero root', () => {
      it('reverts', async function () {
        await shouldFail.reverting(
          this.collateralManager.addWithdrawalRoot(
            ZERO_BYTES32,
            rootNonce1,
            [],
            { from: owner }
          )
        )
      })
    })

    describe('when withdrawal publisher adds a root', () => {
      it('is allowed', async function () {
        await this.collateralManager.addWithdrawalRoot(
          merkleRoot1,
          rootNonce1,
          [],
          { from: withdrawalPublisher }
        )
      })
    })

    describe('when an unauthorized user adds a root', () => {
      it('reverts', async function () {
        await shouldFail.reverting(
          this.collateralManager.addWithdrawalRoot(
            merkleRoot1,
            rootNonce1,
            [],
            { from: unknown }
          )
        )
      })
    })
  })
})

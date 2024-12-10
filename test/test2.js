const { expect } = require("chai");
const { ethers } = require("hardhat");
const { generateRandomKeys } = require("paillier-bigint");

describe("EncryptedIQCalculator", function () {
  let paillier, iqCalculator;
  let owner, user1, user2, user3;
  let groupId;
  let publicKey, privateKey;

  function bigIntToHex(bigIntValue) {
    let hexStr = bigIntValue.toString(16);
    if (hexStr.length % 2 !== 0) {
      hexStr = '0' + hexStr;
    }
    return '0x' + hexStr;
  }

  beforeEach(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();
    
    groupId = ethers.keccak256(ethers.toUtf8Bytes("group-" + Date.now()));

    const Paillier = await ethers.getContractFactory("Paillier");
    paillier = await Paillier.deploy();

    const EncryptedIQCalculator = await ethers.getContractFactory("EncryptedIQCalculator");
    iqCalculator = await EncryptedIQCalculator.deploy(await paillier.getAddress());

    const keys = await generateRandomKeys(2048);
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
  });

  describe("Group Creation and Validation", function() {
    it("Should allow creating a new group", async function() {
      await expect(iqCalculator.createGroup(groupId))
        .to.emit(iqCalculator, "GroupCreated")
        .withArgs(groupId, owner.address);
    });

    it("Should not allow creating a group that exists in active groups", async function() {
      await iqCalculator.createGroup(groupId);
      await expect(iqCalculator.createGroup(groupId))
        .to.be.revertedWith("Group exists in active groups");
    });

    it("Should not allow creating a group that exists in finalized results", async function() {
      await iqCalculator.createGroup(groupId);
      
      // Submit a score and finalize the group
      const score = bigIntToHex(publicKey.encrypt(BigInt(100)));
      await iqCalculator.connect(user1).submitScore(groupId, score);
      
      const publicKeyForContract = {
        n: bigIntToHex(publicKey.n),
        g: bigIntToHex(publicKey.g)
      };
      
      await iqCalculator.finalizeGroup(groupId, publicKeyForContract);
      
      // Try to create the same group again
      await expect(iqCalculator.createGroup(groupId))
        .to.be.revertedWith("Group exists in finalized results");
    });
  });

  describe("Group Details and Participant Status", function() {
    beforeEach(async function() {
      await iqCalculator.createGroup(groupId);
    });

    it("Should correctly return group details", async function() {
      const [groupOwner, participantCount, isActive] = await iqCalculator.getGroupDetails(groupId);
      
      expect(groupOwner).to.equal(owner.address);
      expect(participantCount).to.equal(0);
      expect(isActive).to.be.true;
    });

    it("Should correctly track participant submissions", async function() {
      const score = bigIntToHex(publicKey.encrypt(BigInt(100)));
      await iqCalculator.connect(user1).submitScore(groupId, score);

      expect(await iqCalculator.hasParticipantSubmitted(groupId, user1.address)).to.be.true;
      expect(await iqCalculator.hasParticipantSubmitted(groupId, user2.address)).to.be.false;
    });

    it("Should update group details after submissions", async function() {
      const score = bigIntToHex(publicKey.encrypt(BigInt(100)));
      await iqCalculator.connect(user1).submitScore(groupId, score);
      await iqCalculator.connect(user2).submitScore(groupId, score);

      const [, participantCount, isActive] = await iqCalculator.getGroupDetails(groupId);
      expect(participantCount).to.equal(2);
      expect(isActive).to.be.true;
    });
  });

  describe("Score Submission and Finalization", function() {
    beforeEach(async function() {
      await iqCalculator.createGroup(groupId);
    });

    it("Should not allow double submission from same participant", async function() {
      const score = bigIntToHex(publicKey.encrypt(BigInt(100)));
      await iqCalculator.connect(user1).submitScore(groupId, score);
      
      await expect(iqCalculator.connect(user1).submitScore(groupId, score))
        .to.be.revertedWith("Already submitted score");
    });

    it("Should correctly calculate sum and count in finalization", async function() {
      const scores = [95, 105, 100];
      for (let i = 0; i < scores.length; i++) {
        const encryptedScore = bigIntToHex(publicKey.encrypt(BigInt(scores[i])));
        await iqCalculator.connect([user1, user2, user3][i]).submitScore(groupId, encryptedScore);
      }

      const publicKeyForContract = {
        n: bigIntToHex(publicKey.n),
        g: bigIntToHex(publicKey.g)
      };

      await iqCalculator.finalizeGroup(groupId, publicKeyForContract);
      
      const [encryptedSum, count] = await iqCalculator.getResult(groupId);
      const decryptedSum = Number(privateKey.decrypt(BigInt(encryptedSum)));
      const average = decryptedSum / Number(count);

      expect(count).to.equal(3);
      expect(average).to.be.approximately(100, 1);
    });
  });

  describe("Group Status Checks", function() {
    it("Should correctly track finalization status", async function() {
      await iqCalculator.createGroup(groupId);
      expect(await iqCalculator.isFinalized(groupId)).to.be.false;

      const score = bigIntToHex(publicKey.encrypt(BigInt(100)));
      await iqCalculator.connect(user1).submitScore(groupId, score);

      const publicKeyForContract = {
        n: bigIntToHex(publicKey.n),
        g: bigIntToHex(publicKey.g)
      };
      
      await iqCalculator.finalizeGroup(groupId, publicKeyForContract);
      expect(await iqCalculator.isFinalized(groupId)).to.be.true;
    });

    it("Should prevent actions on finalized groups", async function() {
      await iqCalculator.createGroup(groupId);
      const score = bigIntToHex(publicKey.encrypt(BigInt(100)));
      await iqCalculator.connect(user1).submitScore(groupId, score);

      const publicKeyForContract = {
        n: bigIntToHex(publicKey.n),
        g: bigIntToHex(publicKey.g)
      };
      
      await iqCalculator.finalizeGroup(groupId, publicKeyForContract);

      await expect(iqCalculator.connect(user2).submitScore(groupId, score))
        .to.be.reverted;
    });
  });
});
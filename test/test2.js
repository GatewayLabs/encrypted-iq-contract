const { expect } = require("chai");
const { ethers } = require("hardhat");
const { generateRandomKeys } = require("paillier-bigint");

describe("EncryptedIQCalculator", function () {
  let paillier, iqCalculator;
  let owner, user1, user2, user3;
  let groupId;
  let publicKey, privateKey;

  // Helper function to convert BigInt to padded hex string
  function bigIntToHex(bigIntValue) {
    let hexStr = bigIntValue.toString(16);
    if (hexStr.length % 2 !== 0) {
      hexStr = '0' + hexStr;
    }
    return '0x' + hexStr;
  }

  beforeEach(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();

    // Create a unique groupId for each test
    groupId = ethers.keccak256(ethers.toUtf8Bytes("group-" + Date.now()));

    // Deploy the Paillier contract
    const Paillier = await ethers.getContractFactory("Paillier");
    paillier = await Paillier.deploy();

    // Deploy the EncryptedIQCalculator contract
    const EncryptedIQCalculator = await ethers.getContractFactory("EncryptedIQCalculator");
    iqCalculator = await EncryptedIQCalculator.deploy(await paillier.getAddress());

    // Generate Paillier keys
    const keys = await generateRandomKeys(2048);
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
  });

  describe("Group Creation", function () {
    it("Should allow creating a new group", async function () {
      await expect(iqCalculator.createGroup(groupId))
        .to.emit(iqCalculator, "GroupCreated")
        .withArgs(groupId, owner.address);
    });

    it("Should not allow creating a group that already exists", async function () {
      await iqCalculator.createGroup(groupId);
      await expect(iqCalculator.createGroup(groupId))
        .to.be.revertedWith("Group exists");
    });
  });

  describe("Score Submission", function () {
    beforeEach(async function () {
      await iqCalculator.createGroup(groupId);
    });

    it("Should allow submitting an encrypted score", async function () {
      const score = 100;
      const encryptedScore = bigIntToHex(publicKey.encrypt(BigInt(score)));

      await expect(iqCalculator.connect(user1).submitScore(groupId, encryptedScore))
        .to.emit(iqCalculator, "ScoreSubmitted")
        .withArgs(groupId, user1.address);
    });

    it("Should not allow submitting multiple scores from the same user", async function () {
      const score = 100;
      const encryptedScore = bigIntToHex(publicKey.encrypt(BigInt(score)));

      await iqCalculator.connect(user1).submitScore(groupId, encryptedScore);
      await expect(iqCalculator.connect(user1).submitScore(groupId, encryptedScore))
        .to.be.revertedWith("Already submitted score");
    });

    it("Should not allow submitting to non-existent group", async function () {
      const fakeGroupId = ethers.keccak256(ethers.toUtf8Bytes("fake-group"));
      const score = 100;
      const encryptedScore = bigIntToHex(publicKey.encrypt(BigInt(score)));

      await expect(iqCalculator.connect(user1).submitScore(fakeGroupId, encryptedScore))
        .to.be.revertedWith("Group doesn't exist");
    });
  });

  describe("Group Finalization", function () {
    beforeEach(async function () {
      await iqCalculator.createGroup(groupId);

      // Submit scores from multiple users
      const scores = [95, 105, 100];
      console.log("Submitting scores:", scores);

      for (let i = 0; i < scores.length; i++) {
        const encryptedScore = bigIntToHex(publicKey.encrypt(BigInt(scores[i])));
        await iqCalculator.connect([user1, user2, user3][i]).submitScore(groupId, encryptedScore);
      }
    });

    it("Should allow owner to finalize group", async function () {
      const publicKeyForContract = {
        n: bigIntToHex(publicKey.n),
        g: bigIntToHex(publicKey.g)
      };

      await expect(iqCalculator.finalizeGroup(groupId, publicKeyForContract))
        .to.emit(iqCalculator, "GroupFinalized");
    });

    it("Should not allow non-owner to finalize group", async function () {
      const publicKeyForContract = {
        n: bigIntToHex(publicKey.n),
        g: bigIntToHex(publicKey.g)
      };

      await expect(iqCalculator.connect(user1).finalizeGroup(groupId, publicKeyForContract))
        .to.be.revertedWith("Not group owner");
    });

    it("Should correctly calculate sum and count", async function () {
      const publicKeyForContract = {
        n: bigIntToHex(publicKey.n),
        g: bigIntToHex(publicKey.g)
      };

      await iqCalculator.finalizeGroup(groupId, publicKeyForContract);

      // Get encrypted sum and count
      const [encryptedSum, count] = await iqCalculator.getResult(groupId);
      console.log("Participant count:", count.toString());



      // Convert the encrypted sum to BigInt and decrypt
      const encryptedBigInt = BigInt(encryptedSum);
      const decryptedSum = Number(privateKey.decrypt(encryptedBigInt));
      console.log("Decrypted sum:", decryptedSum);

      // Calculate average off-chain
      const average = decryptedSum / Number(count);
      console.log("Calculated average:", average);

      // The average of [95, 105, 100] should be 100
      expect(average).to.be.approximately(100, 1);
      expect(count).to.equal(3);
    });
  });

  describe("Finalized Group Queries", function () {
    it("Should correctly report finalization status", async function () {
      await iqCalculator.createGroup(groupId);
      expect(await iqCalculator.isFinalized(groupId)).to.be.false;

      // Submit a score and finalize
      const score = bigIntToHex(publicKey.encrypt(BigInt(100)));
      await iqCalculator.connect(user1).submitScore(groupId, score);

      const publicKeyForContract = {
        n: bigIntToHex(publicKey.n),
        g: bigIntToHex(publicKey.g)
      };

      await iqCalculator.finalizeGroup(groupId, publicKeyForContract);
      expect(await iqCalculator.isFinalized(groupId)).to.be.true;
    });

    it("Should not allow accessing result of non-finalized group", async function () {
      await iqCalculator.createGroup(groupId);
      await expect(iqCalculator.getResult(groupId))
        .to.be.revertedWith("Not finalized");
    });
  });
});